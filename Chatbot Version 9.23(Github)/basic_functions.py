import requests
import json

# 设置API密钥
API_KEY = "Your Google API Key"
url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={API_KEY}"

def get_response(msg):
        headers = {
        "Content-Type": "application/json"
    }
        prompt = msg
        data = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2000
        }
    }
        response = requests.post(url, headers=headers, data=json.dumps(data))
        if response.status_code == 200:
            response_data = response.json()
            #print(response_data)
            generated_text = response_data['candidates'][0]['content']['parts'][0]['text']
            #questions = generated_text.strip().split("\n")
            return generated_text
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            return None