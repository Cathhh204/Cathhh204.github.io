"""
Image Processing Playground - Flask backend (CMU 15-113, Project 2).

GET  /             serves the web page.
POST /api/process  receives an image, an operation name and that operation's
                   parameters, runs the operation with OpenCV, and returns the
                   result as a base64-encoded JPEG inside a JSON response.

This code never saves an uploaded image. Each request decodes the image in
memory, processes it, sends back the result and forgets it.
"""

import base64

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png"}
OPERATIONS = {"original", "grayscale", "blur", "edges", "sharpen", "hough"}

MAX_UPLOAD_MEGABYTES = 10
MAX_IMAGE_DIMENSION = 1400  # longest side in pixels; bigger images are shrunk

# Flask rejects bigger uploads with a 413 error before our route even runs.
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MEGABYTES * 1024 * 1024

# The center pixel is multiplied by 5 and its four neighbors are subtracted.
# The weights add up to 1, so a flat area keeps its brightness, but a pixel
# that differs from its neighbors gets pushed even further away from them.
SHARPEN_KERNEL = np.array(
    [[0, -1, 0],
     [-1, 5, -1],
     [0, -1, 0]],
    dtype=np.float32,
)

# Canny thresholds used to find edges before running the Hough transform.
HOUGH_CANNY_LOW = 50
HOUGH_CANNY_HIGH = 150
LINE_COLOR = (0, 0, 255)  # red, because OpenCV stores colors as BGR, not RGB


# ---------- Reading and validating the request ----------

def read_uploaded_image():
    """Decode the uploaded file into an OpenCV image, or raise ValueError."""
    uploaded_file = request.files.get("image")
    if uploaded_file is None or uploaded_file.filename == "":
        raise ValueError("No image was uploaded.")

    filename = uploaded_file.filename.lower()
    extension = filename.rsplit(".", 1)[-1]
    if "." not in filename or extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type. Please upload a JPG or PNG image.")

    # The extension only tells us what the file is called. Actually decoding
    # the bytes is what proves it is a real image. imdecode returns None when
    # it cannot decode them.
    file_bytes = np.frombuffer(uploaded_file.read(), dtype=np.uint8)
    image = None
    if file_bytes.size > 0:
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("That file could not be read as an image. It may be corrupted.")

    return shrink_if_too_large(image)


def shrink_if_too_large(image):
    """Scale the image down so its longest side is at most MAX_IMAGE_DIMENSION."""
    height, width = image.shape[:2]
    longest_side = max(height, width)
    if longest_side <= MAX_IMAGE_DIMENSION:
        return image

    scale = MAX_IMAGE_DIMENSION / longest_side
    new_size = (round(width * scale), round(height * scale))
    return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)


def read_number(name, minimum, maximum):
    """Read a numeric form field and check that it is inside its allowed range."""
    try:
        value = float(request.form.get(name, ""))
    except ValueError:
        raise ValueError(f"'{name}' must be a number.")

    if not minimum <= value <= maximum:
        raise ValueError(f"'{name}' must be between {minimum} and {maximum}.")
    return value


def read_parameters(operation):
    """Return the validated parameters that the chosen operation needs."""
    if operation not in OPERATIONS:
        raise ValueError("Unknown operation.")

    if operation == "blur":
        return {"sigma": read_number("sigma", 0.5, 5.0)}

    if operation == "edges":
        low = read_number("low_threshold", 0, 255)
        high = read_number("high_threshold", 0, 255)
        if high < low:
            raise ValueError("The high threshold cannot be lower than the low threshold.")
        return {"low": low, "high": high}

    if operation == "hough":
        return {"max_lines": int(read_number("max_lines", 1, 30))}

    return {}


# ---------- Image processing ----------

def to_grayscale(image):
    """Turn three color values per pixel into one brightness value per pixel."""
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def gaussian_blur(image, sigma):
    # A kernel size of (0, 0) tells OpenCV to pick the size from sigma, so a
    # bigger sigma automatically averages over a wider neighborhood.
    return cv2.GaussianBlur(image, (0, 0), sigmaX=sigma)


def detect_edges(image, low_threshold, high_threshold):
    """Return a black image with white pixels wherever Canny finds an edge."""
    gray = to_grayscale(image)
    # cv2.Canny does not smooth the image itself. Without this light blur,
    # sensor noise and fine texture would show up as lots of tiny edges.
    smoothed = cv2.GaussianBlur(gray, (5, 5), 0)
    return cv2.Canny(smoothed, low_threshold, high_threshold)


def sharpen(image):
    # filter2D slides the kernel over every pixel (a convolution). The -1
    # means "give the output the same data type as the input".
    return cv2.filter2D(image, -1, SHARPEN_KERNEL)


def segment_length(segment):
    x1, y1, x2, y2 = segment
    return np.hypot(x2 - x1, y2 - y1)


def draw_hough_lines(image, max_lines):
    """Draw the longest detected line segments on a copy of the image.

    Returns the annotated copy and the total number of segments detected.
    """
    # The Hough transform does not look at the photo itself. It takes a set
    # of edge pixels and lets each one "vote" for every line that could pass
    # through it, so the image has to be reduced to its edge pixels first.
    edges = detect_edges(image, HOUGH_CANNY_LOW, HOUGH_CANNY_HIGH)

    shortest_side = min(image.shape[:2])
    lines = cv2.HoughLinesP(
        edges,
        rho=1,                # distance step of the voting grid, in pixels
        theta=np.pi / 180,    # angle step of the voting grid: 1 degree
        threshold=50,         # votes (edge pixels) a line needs to be accepted
        minLineLength=shortest_side // 10,
        maxLineGap=10,        # bridge gaps of up to 10 pixels along a line
    )

    annotated = image.copy()
    if lines is None:
        return annotated, 0

    # Each detected line is a segment described by its two endpoints
    # (x1, y1, x2, y2), in pixel coordinates of the image.
    segments = sorted(lines.reshape(-1, 4), key=segment_length, reverse=True)

    thickness = max(2, max(image.shape[:2]) // 400)
    for x1, y1, x2, y2 in segments[:max_lines]:
        start, end = (int(x1), int(y1)), (int(x2), int(y2))
        cv2.line(annotated, start, end, LINE_COLOR, thickness, cv2.LINE_AA)

    return annotated, len(segments)


def apply_operation(image, operation, params):
    """Run one operation. Returns the result and a note for the user (or "")."""
    message = ""

    if operation == "original":
        result = image
    elif operation == "grayscale":
        result = to_grayscale(image)
    elif operation == "blur":
        result = gaussian_blur(image, params["sigma"])
    elif operation == "edges":
        result = detect_edges(image, params["low"], params["high"])
    elif operation == "sharpen":
        result = sharpen(image)
    else:
        result, lines_found = draw_hough_lines(image, params["max_lines"])
        if lines_found == 0:
            message = ("No straight lines were detected. Try a photo with clear "
                       "straight edges, like a building, a road or a bookshelf.")
        else:
            lines_shown = min(lines_found, params["max_lines"])
            message = f"Detected {lines_found} line segments. Showing the {lines_shown} longest."

    return result, message


def encode_as_data_url(image):
    """Encode an image as a base64 JPEG that an <img> tag can use as its src."""
    _, jpeg_bytes = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return "data:image/jpeg;base64," + base64.b64encode(jpeg_bytes).decode("ascii")


# ---------- Routes ----------

@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/process")
def process():
    # Step 1: validate. Anything wrong here is the client's fault (400).
    try:
        image = read_uploaded_image()
        operation = request.form.get("operation", "")
        params = read_parameters(operation)
    except ValueError as error:
        return jsonify(error=str(error)), 400

    # Step 2: process. Anything wrong here is our fault (500).
    try:
        result, message = apply_operation(image, operation, params)
        return jsonify(image=encode_as_data_url(result), message=message)
    except Exception:
        app.logger.exception("Processing failed")
        return jsonify(error="Something went wrong while processing the image."), 500


@app.errorhandler(413)
def upload_too_large(error):
    message = f"That file is too large. Please upload an image under {MAX_UPLOAD_MEGABYTES} MB."
    return jsonify(error=message), 413


if __name__ == "__main__":
    # Port 5001 because macOS uses port 5000 for AirPlay. This block only runs
    # locally; on Render the app is started by gunicorn instead.
    app.run(debug=True, port=5001)
