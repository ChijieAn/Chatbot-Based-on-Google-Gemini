from flask import Flask, request, render_template, jsonify, session
from flask_socketio import SocketIO, emit
from basic_functions import get_response
import json
import os
import pdfplumber
import docx
import time
import requests
from google.cloud import speech
#from google.cloud.speech import enums
#from google.cloud.speech import types
from google.cloud import speech_v1 as speech
import base64
app = Flask(__name__, static_url_path='/static', static_folder='static', template_folder='templates')
app.secret_key = 'super secret key'
socketio = SocketIO(app, async_mode='gevent')

@app.route('/', methods=['GET'])
def home():
    session['qa_pairs'] = []
    session['follow_up_questions'] = []
    session['follow_up_answers'] = []
    session['current_phase'] = 'questions'
    return render_template('base.html')

questions = [
    "How did you meet this student?",
    "What is the advantages and disadvantages of this student?",
    "Discribe a project this student participated in and how his performance in the project demonstrates himself"
]

'''@app.route('/api/ask', methods=['GET'])
def ask():
    msg = request.args.get('msg')
    response = get_response(msg)
    print(response)
    if response:
        return jsonify({'response': response})
    else:
        return jsonify({'message': 'No response detected'}), 200

@app.route('/api/answer', methods=['POST'])
def answer():
    data = request.json
    msg = data.get('answer')
    response = get_response(msg)
    if response:
        return jsonify({'response': response})
    else:
        return jsonify({'message': 'No response detected'}), 200'''


@app.route('/api/ask', methods=['GET'])
def ask_question():
    qa_pairs = session.get('qa_pairs', [])
    current_phase = session.get('current_phase', 'questions')
    
    if current_phase == 'questions':
        if len(qa_pairs) < len(questions):
            question = questions[len(qa_pairs)]
            return jsonify({'question': question})
        else:
            session['current_phase'] = 'follow_up'
            generate_follow_up()
            return jsonify({'message': 'All questions answered, starting follow-up questions.'}), 200
    elif current_phase == 'follow_up':
        follow_up_questions = session.get('follow_up_questions', [])
        follow_up_index = len(qa_pairs) - len(questions)
        if follow_up_index < len(follow_up_questions):
            question = follow_up_questions[follow_up_index]
            return jsonify({'question': question})
        else:
            return jsonify({'message': 'No more follow-up questions.'}), 200

@app.route('/api/answer', methods=['POST'])
def answer_question():
    data = request.json
    answer = data.get('answer')
    qa_pairs = session.get('qa_pairs', [])
    current_phase = session.get('current_phase', 'questions')

    if current_phase == 'questions':
        if len(qa_pairs) < len(questions):
            question = questions[len(qa_pairs)]
            qa_pairs.append((question, answer))
            session['qa_pairs'] = qa_pairs
            return jsonify({'message': 'Answer received'})
        else:
            session['current_phase'] = 'follow_up'
            return jsonify({'message': 'All questions answered'}), 200
    elif current_phase == 'follow_up':
        if answer.lower() in ['stop', 'end follow-up', 'no follow-up']:
            return stop_follow_up()
        follow_up_questions = session.get('follow_up_questions', [])
        follow_up_index = len(qa_pairs) - len(questions)
        if follow_up_index < len(follow_up_questions):
            question = follow_up_questions[follow_up_index]
            qa_pairs.append((question, answer))
            session['qa_pairs'] = qa_pairs
            return jsonify({'message': 'Answer received'})
        else:
            return jsonify({'message': 'All follow-up questions answered, generating summary and recommendation letter.'}), 200
    else:
        return jsonify({'message': 'Unexpected phase'}), 200

@app.route('/api/stop', methods=['POST'])
def stop_follow_up():
    qa_pairs = session.get('qa_pairs', [])
    cv_summary = session.get('cv_summary', '')
    uploaded_files = session.get('uploaded_files', [])
    summary_prompt = "Based on the following Q&A pairs, and CV information, and the information from other files,please generate a summary:\n"
    for q, a in qa_pairs:
        summary_prompt += f"Q: {q}\nA: {a}\n"
    summary_prompt += f"\nHere is the CV summary:\n{cv_summary}\n"
    if uploaded_files:
        summary_prompt += "\nHere are the summaries of other uploaded documents:\n"
        for file_info in uploaded_files:
            summary_prompt += f"Filename: {file_info['filename']}\n"
            summary_prompt += f"Summary: {file_info['summary']}\n"
    summary = get_response(summary_prompt)
    
    recommendation_prompt = f"Based on the following summary, please generate a recommendation letter:\n{summary}"
    recommendation_letter = get_response(recommendation_prompt)
    
    return jsonify({
        'summary': summary,
        'recommendation_letter': recommendation_letter
    })

@app.route('/api/follow_up', methods=['GET'])
def generate_follow_up():
    qa_pairs = session.get('qa_pairs', [])
    cv_summary = session.get('cv_summary', '')
    uploaded_files = session.get('uploaded_files', [])
    prompt = "Here are the questions and answers:\n"
    for q, a in qa_pairs:
        prompt += f"Q: {q}\nA: {a}\n"
    
    prompt += f"\nHere is the CV summary:\n{cv_summary}\n"
    if uploaded_files:
        prompt += "\nHere are the summaries of other uploaded documents:\n"
        for file_info in uploaded_files:
            prompt += f"Filename: {file_info['filename']}\n"
            prompt += f"Summary: {file_info['summary']}\n"
    prompt += "Please generate two follow-up questions based on these answers, the CV summary, and the summaries of other uploaded documents. You are recommended to mix the information in the CV and summary and the summary from other uploaded documents while generating follow up questions. You don't need to explain why you generated the questions, just give me the question itself. "
    
    follow_up_questions = get_response(prompt)
    session['follow_up_questions'] = follow_up_questions.split('\n')
    return jsonify({'follow_up_questions': follow_up_questions})

def parse_pdf(file_path):
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text()
    return text

def parse_docx(file_path):
    doc = docx.Document(file_path)
    text = ""
    for para in doc.paragraphs:
        text += para.text + "\n"
    return text

def generate_summary(text):
    prompt = f"Please provide a summary for the following text:\n\n{text}"
    summary = get_response(prompt)
    return summary

@app.route('/upload_cv', methods=['POST'])
def upload_cv():
    if 'cvFile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['cvFile']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    file_path = os.path.join('/tmp', file.filename)
    file.save(file_path)

    if file.filename.endswith('.pdf'):
        text = parse_pdf(file_path)
    elif file.filename.endswith('.docx'):
        text = parse_docx(file_path)
    else:
        return jsonify({'error': 'Unsupported file type'}), 400

    summary = generate_summary(text)
    session['cv_summary'] = summary  # 存储CV summary
    
    return jsonify({
        'text': text,
        'summary': summary
    })

@app.route('/upload_other', methods=['POST'])
def upload_other():
    # 检查请求中是否包含文件
    if 'otherFile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['otherFile']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # 保存上传的文件到临时目录
    file_path = os.path.join('/tmp', file.filename)
    file.save(file_path)

    # 根据文件类型（PDF 或 DOCX）提取文本
    if file.filename.endswith('.pdf'):
        text = parse_pdf(file_path)
    elif file.filename.endswith('.docx'):
        text = parse_docx(file_path)
    else:
        return jsonify({'error': 'Unsupported file type'}), 400

    # 生成总结（与简历文件类似）
    summary = generate_summary(text)
    # 如果 session 中没有存储任何文件信息，初始化它
    if 'uploaded_files' not in session:
        session['uploaded_files'] = []

    # 将当前文件的提取文本和总结存储到 session 中
    session['uploaded_files'].append({
        'filename': file.filename,
        'text': text,
        'summary': summary
    })

    # 返回提取的文本和总结
    return jsonify({
        'text': text,
        'summary': summary
    })

@app.route('/api/submit_follow_up', methods=['POST'])
def submit_follow_up():
    data = request.json
    follow_up_answers = data.get('follow_up_answers')
    session['follow_up_answers'] = follow_up_answers

    qa_pairs = session.get('qa_pairs', [])
    follow_up_questions = session.get('follow_up_questions', [])
    cv_summary = session.get('cv_summary', '')
    combined_qa_pairs = qa_pairs + list(zip(follow_up_questions, follow_up_answers))

    summary_prompt = "Based on the following Q&A pairs, and information from CV summary, please generate a summary:\n"
    for q, a in combined_qa_pairs:
        summary_prompt += f"Q: {q}\nA: {a}\n"
    summary_prompt += f"\nHere is the CV summary:\n{cv_summary}\n"
    summary = get_response(summary_prompt)
    
    recommendation_prompt = f"Based on the following summary, please generate a recommendation letter:\n{summary}"
    recommendation_letter = get_response(recommendation_prompt)
    
    return jsonify({
        'summary': summary,
        'recommendation_letter': recommendation_letter
    })

def listen_print_loop(responses, timeout):
    start_time = time.time()
    transcript = ''

    for response in responses:
        if time.time() - start_time > timeout:
            break

        if not response.results:
            continue

        result = response.results[0]
        if not result.alternatives:
            continue

        transcript += result.alternatives[0].transcript

    return transcript

@app.route('/upload_audio', methods=['POST'])
def upload_audio():
    print("Received audio upload request")
    
    if 'audio' not in request.files:
        print("No audio file uploaded")
        return jsonify({'error': 'No audio file uploaded'}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        print("No selected audio file")
        return jsonify({'error': 'No selected audio file'}), 400

    API_KEY = "AIzaSyDnaLimEyp-YqX2YMs6JnhXmJPptu9XrYg"
    url = f"https://speech.googleapis.com/v1/speech:recognize?key={API_KEY}"
    
    headers = {
        "Content-Type": "application/json"
    }

    audio_content = audio_file.read()
    print("Audio file content read, size:", len(audio_content))

    # 将音频文件内容转换为 Base64 编码
    audio_base64 = base64.b64encode(audio_content).decode('utf-8')

    config = speech.RecognitionConfig(
    encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
    sample_rate_hertz=48000,
    language_code="en-US"
    )

    config_dict = {
        "encoding": config.encoding,
        "sample_rate_hertz": config.sample_rate_hertz,
        "language_code": config.language_code,
    }

    audio = {
        "content": audio_base64  # 使用标准的 Base64 编码
    }

    data = {
        "config": config_dict,
        "audio": audio
    }

    response = requests.post(url, headers=headers, data=json.dumps(data))
    print(response.json())
    
    if response.status_code == 200:
        response_data = response.json()
        # 打印完整的响应数据（可选）
        print(json.dumps(response_data, indent=2))
        
        if "results" in response_data:
            transcript = ""
            for result in response_data["results"]:
                if 'transcript' in result["alternatives"][0].keys():
                    transcript += result["alternatives"][0]["transcript"] + " "
                else:
                    continue
            return jsonify({'transcript': transcript.strip()})
        else:
            return jsonify({'error': 'No transcription found'}), 200
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return jsonify({'error': f"Failed to transcribe audio, status code: {response.status_code}"}), response.status_code
    
@socketio.on('connect')
def handle_connect():
    emit('response', {'message': 'Connected to server'})

@socketio.on('voice_message')
def handle_voice_message(data):
    transcript = data['transcript']
    response = get_response(transcript)
    emit('response', {'message': response})

if __name__ == '__main__':
    #socketio.run(app, debug=True)
    app.run(debug = True, port = 5001)


