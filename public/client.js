const socket = io();
const notifySound = new Audio('/notify.mp3');

let myName = "";
// --- ВИДАЛЕННЯ ПОВІДОМЛЕНЬ ---
function deleteMessage(msgId) {
    if (confirm('Точно видалити це повідомлення?')) {
        socket.emit('delete message', msgId);
    }
}

socket.on('message deleted', (msgId) => {
    // Прибираємо будь-які пробіли, щоб гарантовано знайти елемент
    const elementId = "msg-" + msgId.trim();
    const msgItem = document.getElementById('msg-' + msgId);

    console.log("🔍 Шукаю елемент з ID:", elementId); // Перевір це в консолі!

    if (msgItem) {
        msgItem.style.transition = "0.3s";
        msgItem.style.opacity = "0";
        msgItem.style.transform = "scale(0.8)";
        setTimeout(() => msgItem.remove(), 300);
    } else {
        console.log("❌ Елемент не знайдено в DOM!");
    }
});

// Елементи форми входу
const authOverlay = document.getElementById('auth-overlay');
const chatContainer = document.getElementById('chat-container');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const userInp = document.getElementById('auth-username');
const passInp = document.getElementById('auth-password');
const authMsg = document.getElementById('auth-msg');

// --- ФУНКЦІЇ ВХОДУ ТА ВАЛІДАЦІЯ ---
const togglePasswordBtn = document.getElementById('toggle-password');

togglePasswordBtn.addEventListener('click', () => {
    const type = passInp.getAttribute('type') === 'password' ? 'text' : 'password';
    passInp.setAttribute('type', type);
    togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
});

loginBtn.addEventListener('click', () => {
    const username = userInp.value.trim();
    const password = passInp.value.trim();

    if (!username || !password) {
        authMsg.textContent = 'Введи нік та пароль!';
        authMsg.style.color = 'red';
        return;
    }
    socket.emit('login', { username, password });
});

registerBtn.addEventListener('click', () => {
    const username = userInp.value.trim();
    const password = passInp.value.trim();

    if (!username) {
        authMsg.textContent = 'Нік не може бути пустим!';
        authMsg.style.color = 'red';
        return;
    }
    if (password.length < 4) {
        authMsg.textContent = 'Пароль має бути не менше 4 символів!';
        authMsg.style.color = 'red';
        return;
    }
    socket.emit('register', { username, password });
});

socket.on('auth success', (name) => {
    myName = name;
    authOverlay.style.display = 'none';
    chatContainer.style.display = 'flex';
    socket.emit('user joined', myName);
});

socket.on('auth error', (err) => {
    authMsg.textContent = err;
    authMsg.style.color = 'red';
});

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const recordBtn = document.getElementById('record-btn');
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');

function scrollToBottom() { messages.scrollTop = messages.scrollHeight; }

// --- ЛОГІКА ВІДПРАВКИ КАРТИНОК ---
imageBtn.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', function () {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

                const now = new Date();
                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

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

// --- ЛОГІКА ДЛЯ МІКРОФОНА ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

recordBtn.addEventListener('click', async () => {
    if (!mediaRecorder) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = [];
                const now = new Date();
                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                socket.emit('chat message', {
                    user: myName,
                    audio: audioBlob,
                    time: currentTime
                });
            };
            startRecording();
        } catch (err) {
            alert("Потрібен дозвіл на мікрофон!");
        }
        return;
    }

    if (!isRecording) startRecording();
    else stopRecording();
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
    item.id = 'msg-' + data.msgId;

    const firstLetter = data.user.charAt(0);
    const bgColor = getAvatarColor(data.user);
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

    // Формуємо блок з кнопками
    let buttonsHtml = `
        <button class="like-btn" onclick="sendLike('${data.msgId}')">
            ❤️ <span class="like-count">${data.likes || 0}</span>
        </button>
    `;

    // Додаємо кнопку видалення, якщо це моє повідомлення
    if (data.user === myName) {
        buttonsHtml += `
            <span class="delete-btn" onclick="deleteMessage('${data.msgId}')" title="Видалити">🗑️</span>
        `;
    }

    // Збираємо все в один блок
    item.innerHTML = `
        <div class="msg-content">
            ${nameSpan}
            ${contentHtml}
        </div>
        <div class="msg-actions">
            ${buttonsHtml}
        </div>
    `;

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

let typingTimer;
input.addEventListener('input', function () {
    socket.emit('typing', myName);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('stop typing', myName), 1500);
});

socket.on('typing', function (name) { typingIndicator.textContent = `${name} друкує... ✍️`; });
socket.on('stop typing', function () { typingIndicator.textContent = ''; });

form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (input.value.trim()) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
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

onlineCountEl.addEventListener('click', () => {
    onlineDropdown.classList.toggle('show');
});

document.addEventListener('click', (event) => {
    if (!document.getElementById('online-container').contains(event.target)) {
        onlineDropdown.classList.remove('show');
    }
});

socket.on('update online users', function (usersArray) {
    onlineCountEl.textContent = `В мережі: ${usersArray.length}`;
    onlineUsersList.innerHTML = '';

    usersArray.forEach(user => {
        const li = document.createElement('li');
        const firstLetter = user.charAt(0);
        const bgColor = getAvatarColor(user);
        const avatarHtml = `<div class="avatar" style="background-color: ${bgColor};">${firstLetter}</div>`;
        const displayName = user === myName ? `<strong>${user} (Ти)</strong>` : user;

        li.innerHTML = `${avatarHtml} <span>${displayName}</span>`;
        onlineUsersList.appendChild(li);
    });
});

function getAvatarColor(name) {
    const colors = [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7',
        '#3f51b5', '#2196f3', '#00bcd4', '#009688',
        '#4caf50', '#ff9800', '#ff5722', '#795548', '#607d8b'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// --- ЛАЙКИ ---
function sendLike(msgId) {
    socket.emit('like message', msgId);
}

socket.on('update likes', (msgId) => {
    const msgDiv = document.getElementById(`msg-${msgId}`);
    if (msgDiv) {
        const countSpan = msgDiv.querySelector('.like-count');
        countSpan.innerText = parseInt(countSpan.innerText) + 1;
    }
});



// --- ЛОГІКА ДЛЯ ФОТО НА ВЕСЬ ЕКРАН ---
const modal = document.getElementById("image-modal");
const modalImg = document.getElementById("modal-img");
const closeModal = document.querySelector(".close-modal");

// Додаємо перевірку: якщо модального вікна немає (ще не завантажилось), не виконуємо код далі
if (modal && modalImg && closeModal) {
    messages.addEventListener('click', function (e) {
        if (e.target.tagName === 'IMG') {
            modal.classList.add('show');
            modalImg.src = e.target.src;
        }
    });

    closeModal.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    modal.addEventListener('click', (e) => {
        if (e.target !== modalImg) {
            modal.classList.remove('show');
        }
    });
}