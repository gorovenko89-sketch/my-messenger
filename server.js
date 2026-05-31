require('dotenv').config();
const xss = require('xss');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb'); // ПІДКЛЮЧАЄМО MONGODB!

const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static('public'));
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

// --- ПІДКЛЮЧЕННЯ ДО MONGODB ---
//mongodb+srv://gorovenko89_db_user:Do418032013.@cluster0.qtc3vhg.mongodb.net/?appName=Cluster0
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri);
let db, usersCollection, messagesCollection;

async function connectDB() {
    try {
        await client.connect();
        console.log("✅ Успішно підключено до Хмарної бази MongoDB!");
        db = client.db("secret_chat"); 
        usersCollection = db.collection("users"); 
        messagesCollection = db.collection("messages"); 

        // 30 днів = 30 * 24 * 60 * 60 = 2592000 секунд автовидалення
        await messagesCollection.createIndex(
            { "createdAt": 1 }, 
            { expireAfterSeconds: 2592000 } 
        );
        console.log("⏳ Таймер автовидалення (30 днів) успішно активовано!");

    } catch (e) {
        console.error("❌ Помилка підключення до MongoDB:", e);
    }
}
connectDB(); // Запускаємо підключення при старті сервера

const onlineUsers = new Map();

io.on('connection', (socket) => {

    // --- РЕЄСТРАЦІЯ (Тепер у хмарі!) ---
    socket.on('register', async (data) => {
        const username = data.username.trim();
        const password = data.password.trim();

        if (!username || username === '') return socket.emit('auth error', 'Нік пустий!');
        if (!password || password.length < 4) return socket.emit('auth error', 'Пароль надто короткий!');

        // Шукаємо, чи є вже такий юзер у базі
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) return socket.emit('auth error', 'Цей нік уже зайнятий!');

        // Шифруємо і зберігаємо в MongoDB
        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCollection.insertOne({ username, password: hashedPassword });

        socket.emit('auth success', username);
    });

    // --- ВХІД ---
    socket.on('login', async (data) => {
        const username = data.username.trim();
        const password = data.password.trim();

        // Дістаємо юзера з бази
        const user = await usersCollection.findOne({ username });
        if (!user) return socket.emit('auth error', 'Користувача не знайдено!');

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            socket.emit('auth success', username);
        } else {
            socket.emit('auth error', 'Невірний пароль!');
        }
    });

    // --- ЛОГІКА ЧАТУ ---
    socket.on('user joined', async (name) => {
        socket.username = name;
        onlineUsers.set(socket.id, name);

        // Дістаємо останні 50 повідомлень з бази даних
        const history = await messagesCollection.find().sort({ _id: -1 }).limit(50).toArray();
        // Перевертаємо, щоб старі були зверху, а нові знизу
        socket.emit('message history', history.reverse());

        io.emit('system message', `${name} увійшов у чат 🛡️`);
        io.emit('update online users', Array.from(onlineUsers.values()));
    });
// блок збереження повідомлень з міткою часу + захистом від XSS
    socket.on('chat message', async (data) => {
        if (data.text) {
            data.text = xss(data.text); // Захист від XSS
        }
        const messageToSave = {
            ...data,
            msgId: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            likes: 0,
            createdAt: new Date()
        };

        await messagesCollection.insertOne(messageToSave);
        io.emit('chat message', messageToSave);
    });
    //обробка лайків
    socket.on('like message', async (msgId) => {
        await messagesCollection.updateOne({ msgId }, { $inc: { likes: 1 } });
        io.emit('update likes', msgId);
    });

    socket.on('typing', (name) => socket.broadcast.emit('typing', name));
    socket.on('stop typing', (name) => socket.broadcast.emit('stop typing', name));

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.id);
            io.emit('update online users', Array.from(onlineUsers.values()));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 Сервер запущено на порту ${PORT}`); });