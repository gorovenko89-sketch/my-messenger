const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Модуль для шифрування

const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static('public'));
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

// Шляхи до файлів баз даних
const historyFile = './history.json';
const usersFile = './users.json';

// Безпечне завантаження баз даних (працює ПІСЛЯ підключення fs)
const loadDB = (file, defaultData) => {
    try {
        if (fs.existsSync(file)) {
            const data = fs.readFileSync(file, 'utf8');
            return data ? JSON.parse(data) : defaultData;
        }
    } catch (e) {
        console.error(`Помилка читання ${file}:`, e);
    }
    return defaultData;
};

// Завантажуємо бази даних ОДИН РАЗ при старті сервера
let messageHistory = loadDB(historyFile, []);
let usersDB = loadDB(usersFile, {});

const onlineUsers = new Map();

io.on('connection', (socket) => {
    
    // --- РЕЄСТРАЦІЯ ---
   // --- РЕЄСТРАЦІЯ ---
    socket.on('register', async (data) => {
        console.log('📥 СЕРВЕР: Отримав запит на РЕЄСТРАЦІЮ:', data); // ЖУЧОК 1
        const username = data.username.trim();
        const password = data.password.trim();

        if (!username || username === '') return socket.emit('auth error', 'Сервер каже: Нік пустий!');
        if (!password || password.length < 4) return socket.emit('auth error', 'Сервер каже: Пароль надто короткий!');
        if (usersDB[username]) return socket.emit('auth error', 'Цей нік уже зайнятий!');

        const hashedPassword = await bcrypt.hash(password, 10);
        usersDB[username] = { password: hashedPassword };
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        
        console.log(`✅ СЕРВЕР: Успішно зареєстровано ${username}`); // ЖУЧОК 2
        socket.emit('auth success', username);
    });

    // --- ВХІД ---
    socket.on('login', async (data) => {
        
        const username = data.username.trim();
        const password = data.password.trim();
        
        const user = usersDB[username];
        if (!user) {
            console.log(`❌ СЕРВЕР: Користувача ${username} немає в базі!`); // ЖУЧОК 4
            return socket.emit('auth error', 'Користувача не знайдено!');
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            console.log(`✅ СЕРВЕР: Пароль підійшов для ${username}`); // ЖУЧОК 5
            socket.emit('auth success', username);
        } else {
            console.log(`❌ СЕРВЕР: Неправильний пароль для ${username}`); // ЖУЧОК 6
            socket.emit('auth error', 'Невірний пароль!');
        }
    });

    // --- ЛОГІКА ЧАТУ ---
    socket.on('user joined', (name) => {
        socket.username = name;
        onlineUsers.set(socket.id, name);
        socket.emit('message history', messageHistory);
        io.emit('system message', `${name} увійшов у чат 🛡️`);
        io.emit('update online users', Array.from(onlineUsers.values()));
    });

    socket.on('chat message', (data) => {
        messageHistory.push(data);
        if (messageHistory.length > 50) messageHistory.shift();
        fs.writeFileSync(historyFile, JSON.stringify(messageHistory, null, 2));
        io.emit('chat message', data);
    });

    socket.on('typing', (name) => {
        socket.broadcast.emit('typing', name);
    });

    socket.on('stop typing', (name) => {
        socket.broadcast.emit('stop typing', name);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.id);
            io.emit('update online users', Array.from(onlineUsers.values()));
        }
    });
});

server.listen(3000, () => { console.log('🚀 Сервер запущено'); });