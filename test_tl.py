import urllib.parse
import urllib.request
import json
import re

def hinglish_to_hindi(text):
    # Split text into chunks to avoid long URLs
    words = text.split()
    output = []
    
    # Process in chunks of 10 words
    chunk_size = 10
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i+chunk_size])
        
        # Only transliterate if it contains english alphabet characters
        if not re.search('[a-zA-Z]', chunk):
            output.append(chunk)
            continue
            
        encoded_text = urllib.parse.quote(chunk)
        url = f"https://inputtools.google.com/request?text={encoded_text}&itc=hi-t-i0-und&num=1"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as response:
                data = json.loads(response.read().decode())
                if data[0] == 'SUCCESS':
                    for item in data[1]:
                        if len(item[1]) > 0:
                            output.append(item[1][0])
                        else:
                            output.append(item[0])
                else:
                    output.append(chunk)
        except Exception as e:
            output.append(chunk)
            
    return " ".join(output)

if __name__ == "__main__":
    print("Test 1:")
    print(hinglish_to_hindi("Arey yaar, maine extra problem solve kar diya hai"))
    print("\nTest 2:")
    print(hinglish_to_hindi("kya haal hai bhai!!!"))
