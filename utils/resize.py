from PIL import Image
import os

# --- Configuration ---
SOURCE_IMAGE = '../MathNano/images/icon-128.png'
TARGET_SIZES = [16, 32, 48]
OUTPUT_PREFIX = 'icon_'
# ---------------------

def resize_icons():
    """
    Resizes a source PNG image into multiple smaller sizes
    for use as icons.
    """
    # Check if the source image exists
    if not os.path.exists(SOURCE_IMAGE):
        print(f"Error: Source file not found at '{SOURCE_IMAGE}'")
        return

    try:
        # Open the source image
        with Image.open(SOURCE_IMAGE) as img:
            print(f"Source image '{SOURCE_IMAGE}' opened. Original size: {img.size}")
            
            # Ensure the image is in RGBA mode (supports transparency)
            if img.mode != 'RGBA':
                img = img.convert('RGBA')

            # Loop through the target sizes and create new images
            for size in TARGET_SIZES:
                # Create the new size tuple (width, height)
                new_size = (size, size)
                
                # Use Image.Resampling.LANCZOS for the best quality downscaling
                # This filter is excellent for keeping icons sharp.
                resized_img = img.resize(new_size, resample=Image.Resampling.LANCZOS)
                
                # Define the new filename
                output_filename = f"{OUTPUT_PREFIX}{size}.png"
                
                # Save the resized image
                resized_img.save(output_filename)
                print(f"Successfully created '{output_filename}' with size {new_size}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    resize_icons()