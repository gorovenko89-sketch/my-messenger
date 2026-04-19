const socket = io();
const notifySound = new Audio('/notify.mp3');

let myName = prompt("Введи своє ім'я, якщо ти не какашка:");
if (!myName) myName = "Какашка хитрожопа";

socket.emit('user joined', myName);

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const recordBtn = document.getElementById('record-btn');

// Змінні для картинок
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');

function scrollToBottom() { messages.scrollTop = messages.scrollHeight; }


// --- ЛОГІКА ВІДПРАВКИ КАРТИНОК (ЗІ СТИСНЕННЯМ) ---
imageBtn.addEventListener('click', () => {
    imageInput.click(); 
});

imageInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            // Створюємо віртуальну картинку в пам'яті
            const img = new Image();
            img.src = e.target.result;
            
            img.onload = function() {
                // Створюємо невидиме полотно (canvas) для малювання
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; // Максимальна ширина фото в чаті
                const MAX_HEIGHT = 800; // Максимальна висота
                let width = img.width;
                let height = img.height;

                // Вираховуємо нові розміри, зберігаючи пропорції
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                // Встановлюємо розміри полотна і малюємо на ньому зменшену картинку
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // МАГІЯ: Перетворюємо полотно назад у текст, стискаючи якість до 70% (0.7)
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                
                const now = new Date();
                const hours = now.getHours().toString().padStart(2, '0');
                const minutes = now.getMinutes().toString().padStart(2, '0');
                const currentTime = `${hours}:${minutes}`;

                // Відправляємо вже маленьку, стиснуту картинку!
                socket.emit('chat message', {
                    user: myName,
                    image: compressedBase64, 
                    time: currentTime
                });
            };
        };
        
        reader.readAsDataURL(file); 
        this.value = ""; 
    }
});


// --- ОНОВЛЕНА ЛОГІКА ДЛЯ МІКРОФОНА ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

recordBtn.addEventListener('click', async () => {
    if (!mediaRecorder) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = [];
                
                const now = new Date();
                const hours = now.getHours().toString().padStart(2, '0');
                const minutes = now.getMinutes().toString().padStart(2, '0');
                const currentTime = `${hours}:${minutes}`;

                socket.emit('chat message', {
                    user: myName,
                    audio: audioBlob,
                    time: currentTime
                });
            };
            
            startRecording();
        } catch (err) {
            alert("Потрібен дозвіл на мікрофон! Або з'єднання не є безпечним (потрібен HTTPS/localhost).");
            console.error("Помилка мікрофона:", err);
        }
        return;
    }

    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add('recording');
    recordBtn.textContent = '⏹️';
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '🎤';
}

// --- ВІДОБРАЖЕННЯ ПОВІДОМЛЕНЬ ---
function appendMessage(data) {
const item = document.createElement('li');
const firstLetter = data.user.charAt(0); // Беремо першу літеру
const bgColor = getAvatarColor(data.user); // Отримуємо колір
const avatarHtml = `<div class="avatar" style="background-color: ${bgColor};">${firstLetter}</div>`;
const nameSpan = `<div class="username">${avatarHtml}${data.user} <span class="time">${data.time}</span></div>`;

    let contentHtml = '';

    if (data.image) {
        contentHtml = `<div><img src="${data.image}" alt="Фото від ${data.user}"></div>`;
    } else if (data.audio) {
        const blob = new Blob([data.audio], { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        contentHtml = `<div><audio controls src="${audioUrl}"></audio></div>`;
    } else if (data.text) {
        contentHtml = `<div>${data.text}</div>`;
    }

    item.innerHTML = nameSpan + contentHtml;

    if (data.user === myName) {
        item.classList.add('message', 'my-message');
    } else {
        item.classList.add('message', 'other-message');
        notifySound.play().catch(e => console.log("Звук заблоковано"));
    }

    messages.appendChild(item);
    scrollToBottom();
}

socket.on('message history', function (historyArray) {
    historyArray.forEach(msgData => appendMessage(msgData));
});

socket.on('chat message', function (data) {
    appendMessage(data);
});

socket.on('system message', function (msg) {
    const item = document.createElement('li');
    item.textContent = msg;
    item.classList.add('system-message');
    messages.appendChild(item);
    scrollToBottom();
});

// Індикатор друку
let typingTimer;
input.addEventListener('input', function () {
    socket.emit('typing', myName);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('stop typing', myName), 1500);
});

socket.on('typing', function (name) { typingIndicator.textContent = `${name} друкує... ✍️`; });
socket.on('stop typing', function (name) { typingIndicator.textContent = ''; });

form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (input.value) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        socket.emit('chat message', { user: myName, text: input.value, time: currentTime });
        socket.emit('stop typing', myName);
        input.value = '';
        input.focus();
    }
});
// --- ЛІЧИЛЬНИК ТА СПИСОК ОНЛАЙН ---
const onlineCountEl = document.getElementById('online-count');
const onlineDropdown = document.getElementById('online-dropdown');
const onlineUsersList = document.getElementById('online-users-list');

// Відкриваємо/закриваємо список при кліку на плашку
onlineCountEl.addEventListener('click', () => {
    onlineDropdown.classList.toggle('show');
});

// Закриваємо список, якщо клікнути десь в іншому місці екрана
document.addEventListener('click', (event) => {
    if (!document.getElementById('online-container').contains(event.target)) {
        onlineDropdown.classList.remove('show');
    }
});

// Слухаємо оновлений список від сервера
socket.on('update online users', function(usersArray) {
    // Оновлюємо цифру
    onlineCountEl.textContent = `В мережі: ${usersArray.length}`;
    
    // Очищаємо старий список
    onlineUsersList.innerHTML = '';
    
   // Оновлюємо список новими іменами з аватарками
    usersArray.forEach(user => {
        const li = document.createElement('li');
        const firstLetter = user.charAt(0);
        const bgColor = getAvatarColor(user);
        const avatarHtml = `<div class="avatar" style="background-color: ${bgColor};">${firstLetter}</div>`;
        
        // Додаємо позначку (Ти) для себе
        const displayName = user === myName ? `<strong>${user} (Ти)</strong>` : user;
        
        li.innerHTML = `${avatarHtml} <span>${displayName}</span>`;
        onlineUsersList.appendChild(li);
    });
});
// --- МАГІЧНА ФУНКЦІЯ ДЛЯ АВАТАРОК ---
// Вона завжди видає однаковий колір для однакового імені
function getAvatarColor(name) {
    // Палітра красивих сучасних кольорів (Material Design)
    const colors = [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7', 
        '#3f51b5', '#2196f3', '#00bcd4', '#009688', 
        '#4caf50', '#ff9800', '#ff5722', '#795548', '#607d8b'
    ];
    let hash = 0;
    // Перетворюємо букви імені на унікальне число
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Беремо колір з масиву по цьому числу
    return colors[Math.abs(hash) % colors.length];
}