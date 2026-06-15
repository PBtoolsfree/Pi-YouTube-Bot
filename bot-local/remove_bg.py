from PIL import Image
import sys

def remove_white_background(input_path, output_path, tolerance=200):
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()
        
        newData = []
        for item in datas:
            # Change all white (also shades of whites)
            # to transparent
            if item[0] >= tolerance and item[1] >= tolerance and item[2] >= tolerance:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
                
        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Successfully processed {input_path} -> {output_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
         print("Usage: python remove_bg.py <input> <output>")
         sys.exit(1)
         
    remove_white_background(sys.argv[1], sys.argv[2])
