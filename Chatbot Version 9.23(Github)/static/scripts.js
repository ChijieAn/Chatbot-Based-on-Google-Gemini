var questions = [];
var qa_pairs = [];
var follow_up_questions = [];
var follow_up_answers = [];
var current_question_index = 0;
var socket = io.connect();
//var mediaRecorder; 

//var socket = io.connect('http://localhost:5000', {
    //reconnectionAttempts: Infinity, // 无限次重连尝试
    //reconnectionDelay: 1000, // 每次重连之间的延迟（毫秒）
    //timeout: 20000, // 连接超时时间（毫秒）
    //pingTimeout: 60000, // ping超时时间（毫秒）
    //pingInterval: 25000 // ping间隔时间（毫秒）
//});

socket.on('connect', function() {
    console.log('Connected to server');
});

socket.on('response', function(data) {
    var currentTime = new Date().toLocaleString();  // 获取当前时间
    console.log('Received response at:', currentTime);  // 打印当前时间
    console.log('Response data:', data);
    var message = data.message;
    document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + message + '</div>';
    speakResponse(message);
    //startRecording(); 
});

function startChat() {
    fetch(SCRIPT_ROOT + '/api/ask')
        .then(response => response.json())
        .then(data => {
            if (data.question) {
                document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + data.question + '</div>';
                document.getElementById('questions').style.display = 'block';
                askQuestion(data.question);
                speakResponse(data.question);
                startRecording();
            } else {
                document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + data.message + '</div>';
                speakResponse(data.message);
                startRecording();
                if (data.message.includes("starting follow-up questions")) {
                    generateFollowUpQuestions();
                }
            }
        });
}

function askQuestion(question) {
    document.getElementById('question-box').innerHTML = 'Question: ' + question;
}

function sendAnswer() {
    var answer = document.getElementById('answerInput').value;
    document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + answer + '</div>';
    fetch(SCRIPT_ROOT + '/api/answer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answer: answer }),
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + data.message + '</div>';
        speakResponse(data.message);
        startRecording();
        document.getElementById('answerInput').value = '';
        if (answer.toLowerCase() === 'stop' || answer.toLowerCase() === 'end follow-up' || answer.toLowerCase() === 'no follow-up') {
            stopFollowUp();
        } else {
            fetchNextQuestion();
        }
    });
}

function fetchNextQuestion() {
    fetch(SCRIPT_ROOT + '/api/ask')
        .then(response => response.json())
        .then(data => {
            if (data.question) {
                document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + data.question + '</div>';
                askQuestion(data.question);
                speakResponse(data.question);
                startRecording();
            } else {
                document.getElementById('questions').style.display = 'none';
                if (data.message.includes("starting follow-up questions")) {
                    generateFollowUpQuestions();
                }
            }
        });
}
function generateFollowUpQuestions() {
    fetch(SCRIPT_ROOT + '/api/follow_up')
        .then(response => response.json())
        .then(data => {
            follow_up_questions = data.follow_up_questions.split('\n').filter(q => q.trim() !== '');
            if (follow_up_questions.length > 0) {
                document.getElementById('follow-up').style.display = 'block';
                document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + follow_up_questions[0] + '</div>';
                speakResponse(follow_up_questions[0]);
                startRecording();
                followUpAnswer(0);
            } else {
                document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: No follow-up questions generated.</div>';
                speakResponse('No follow-up questions generated.');
                startRecording();
            }
        });
}

function followUpAnswer(index) {
    if (index < follow_up_questions.length) {
        document.getElementById('followUpAnswerInput').placeholder = follow_up_questions[index];
    }
}


function sendFollowUpAnswer() {
    var answer = document.getElementById('followUpAnswerInput').value;
    document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + answer + '</div>';
    follow_up_answers.push(answer);
    document.getElementById('followUpAnswerInput').value = '';

    if (answer.toLowerCase() === 'stop' || answer.toLowerCase() === 'end follow-up' || answer.toLowerCase() === 'no follow-up') {
        stopFollowUp();
    } else if (follow_up_answers.length < follow_up_questions.length) {
        var nextQuestion = follow_up_questions[follow_up_answers.length];
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + nextQuestion + '</div>';
        speakResponse(nextQuestion);
        startRecording();
        followUpAnswer(follow_up_answers.length);
    } else {
        submitFollowUpAnswers();
    }
}

function submitFollowUpAnswers() {
    fetch(SCRIPT_ROOT + '/api/submit_follow_up', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ follow_up_answers: follow_up_answers }),
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('follow-up').style.display = 'none';
        document.getElementById('recommendation').style.display = 'block';
        document.getElementById('summary').innerHTML = data.summary.replace(/\n/g, '<br>');
        document.getElementById('recommendation-letter').innerHTML = data.recommendation_letter.replace(/\n/g, '<br>');
        speakResponse(data.summary);
        speakResponse(data.recommendation_letter);
    });
}

function stopFollowUp() {
    fetch(SCRIPT_ROOT + '/api/stop', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('follow-up').style.display = 'none';
        document.getElementById('recommendation').style.display = 'block';
        document.getElementById('summary').innerHTML = data.summary.replace(/\n/g, '<br>');
        document.getElementById('recommendation-letter').innerHTML = data.recommendation_letter.replace(/\n/g, '<br>');
        speakResponse(data.summary);
        speakResponse(data.recommendation_letter);
    });
}

/*function startVoiceRecognition() {
    var recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    //recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = function(event) {
        var transcript = event.results[0][0].transcript;
        console.log('Transcript: ' + transcript);
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + transcript + '</div>';
        if (follow_up_questions.length > 0 && follow_up_answers.length < follow_up_questions.length) {
            sendVoiceFollowUpAnswer(transcript);
        } else {
            sendVoiceAnswer(transcript);
        }
    };

    recognition.onerror = function(event) {
        console.log('Error occurred in recognition: ' + event.error);
    };
}*/

function startRecording() {
    console.log('startRecording called at:', new Date().toLocaleString());
    audioChunks = []; // 确保在每次录音开始时重新初始化
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();

            mediaRecorder.ondataavailable = event => {
                if (audioChunks) {
                    audioChunks.push(event.data); // 确保 audioChunks 被正确初始化
                } else {
                    console.error("audioChunks is undefined");
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioChunks = [];
                uploadAudio(audioBlob);
            };
        })
        .catch(error => {
            console.error('Error accessing audio stream:', error);
        });
}
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    } else {
        console.error("mediaRecorder is not active");
    }
}

/*function uploadAudio(audioBlob) {
    var formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    fetch('/upload_audio', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        var transcript = data.transcript;
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + transcript + '</div>';
        sendVoiceAnswer(transcript);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}*/

function uploadAudio(audioBlob) {
    var formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    fetch('/upload_audio', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        var transcript = data.transcript;
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + transcript + '</div>';

        if (follow_up_questions.length > 0 && follow_up_answers.length < follow_up_questions.length) {
            sendVoiceFollowUpAnswer(transcript);
        } else {
            sendVoiceAnswer(transcript);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
/*function startVoiceRecognition() {
    var recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = true; // 设置为true以获取中间结果
    recognition.continuous = true; // 设置为true以使其在长时间停顿时继续运行
    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = function(event) {
        var interim_transcript = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                var transcript = event.results[i][0].transcript;
                console.log('Final Transcript: ' + transcript);
                document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + transcript + '</div>';
                if (follow_up_questions.length > 0 && follow_up_answers.length < follow_up_questions.length) {
                    sendVoiceFollowUpAnswer(transcript);
                } else {
                    sendVoiceAnswer(transcript);
                }
            } else {
                interim_transcript += event.results[i][0].transcript;
                console.log('Interim Transcript: ' + interim_transcript);
            }
        }
    };

    recognition.onerror = function(event) {
        console.log('Error occurred in recognition: ' + event.error);
    };

    recognition.onend = function() {
        console.log('Speech recognition service disconnected');
        // 重新启动语音识别
        recognition.start();
    };
}*/

/*function sendVoiceAnswer(transcript) {
    fetch(SCRIPT_ROOT + '/api/answer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answer: transcript }),
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + data.message + '</div>';
        speakResponse(data.message);
        if (data.message.includes("All questions answered")) {
            generateFollowUpQuestions();
        } else if (data.message.includes("starting follow-up questions")) {
            generateFollowUpQuestions();
        } else {
            fetchNextQuestion();
        }
    });
}*/

function sendVoiceAnswer(transcript) {
    fetch('/api/answer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answer: transcript }),
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + data.response + '</div>';
        speakResponse(data.response);
        startRecording();
        if (data.message.includes("All questions answered")) {
            generateFollowUpQuestions();
        } else if (data.message.includes("starting follow-up questions")) {
            generateFollowUpQuestions();
        } else {
            fetchNextQuestion();
        }
    });
}



function sendVoiceFollowUpAnswer(transcript) {
    document.getElementById('chatbox').innerHTML += '<div class="chat-bubble user">User: ' + transcript + '</div>';
    follow_up_answers.push(transcript);

    if (transcript.toLowerCase() === 'stop' || transcript.toLowerCase() === 'end follow-up' || transcript.toLowerCase() === 'no follow-up') {
        stopFollowUp();
    } else if (follow_up_answers.length < follow_up_questions.length) {
        var nextQuestion = follow_up_questions[follow_up_answers.length];
        document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Bot: ' + nextQuestion + '</div>';
        speakResponse(nextQuestion);
        startRecording();
        followUpAnswer(follow_up_answers.length);
    } else {
        submitFollowUpAnswers();
    }
}

/*function speakResponse(text) {
    var synth = window.speechSynthesis;
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    synth.speak(utterance);
}*/

function speakResponse(text) {
    console.log('speak response called at:', new Date().toLocaleString());
    var synth = window.speechSynthesis;
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    
    utterance.onstart = function() {
        isUserSpeaking = false; // Disable flag when bot starts speaking
    };
    
    utterance.onend = function() {
        isUserSpeaking = true; // Enable flag after the bot finishes speaking
    };
    
    synth.speak(utterance);
    //startRecording();
}

function uploadCV() {
    var formData = new FormData();
    var cvFile = document.getElementById('cvFile').files[0];
    formData.append('cvFile', cvFile);

    fetch(SCRIPT_ROOT + '/upload_cv', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            var extractedText = `Extracted Text: ${data.text}`;
            var summaryText = `Summary: ${data.summary}`;
            document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Extracted Information:<br>' + extractedText + '</div>';
            document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">' + summaryText + '</div>';
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function uploadOtherFile() {
    var formData = new FormData();
    var otherFile = document.getElementById('otherFile').files[0];
    formData.append('otherFile', otherFile);

    fetch(SCRIPT_ROOT + '/upload_other', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            var extractedText = `Extracted Text: ${data.text}`;
            var summaryText = `Summary: ${data.summary}`;
            document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">Extracted Information:<br>' + extractedText + '</div>';
            document.getElementById('chatbox').innerHTML += '<div class="chat-bubble bot">' + summaryText + '</div>';
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
