// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🔴 SETUP: ใส่ Config จาก Firebase Console ตรงนี้
const firebaseConfig = {
    apiKey: "AIzaSyxxxxxx",
    authDomain: "xxxx.firebaseapp.com",
    projectId: "xxxx",
    storageBucket: "xxxx.appspot.com",
    messagingSenderId: "xxxx",
    appId: "xxxx"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// State
let currentDate = new Date();
let selectedDate = new Date();
let currentRoom = localStorage.getItem('aquarium_room_id') || null; // จำห้องไว้
let allData = {}; // เก็บข้อมูลทั้งหมด
let unsubscribe = null; // ตัวปิด Listener

// Elements
const connectScreen = document.getElementById('connect-screen');
const mainApp = document.getElementById('main-app');
const roomDisplay = document.getElementById('room-name-display');

// --- 1. CONNECTION LOGIC ---
function checkLogin() {
    if (currentRoom) {
        connectToRoom(currentRoom);
    } else {
        connectScreen.classList.remove('hidden');
        mainApp.classList.add('hidden');
    }
}

document.getElementById('connect-btn').addEventListener('click', () => {
    const input = document.getElementById('secret-key-input').value.trim();
    if (input) {
        localStorage.setItem('aquarium_room_id', input); // จำในเครื่อง
        connectToRoom(input);
    }
});

window.logoutRoom = () => {
    localStorage.removeItem('aquarium_room_id');
    location.reload();
};

function connectToRoom(roomId) {
    currentRoom = roomId;
    connectScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    roomDisplay.textContent = `Room: ${roomId}`;
    
    startSync(roomId); // เริ่ม Sync
}

// --- 2. REAL-TIME SYNC (หัวใจสำคัญ) ---
function startSync(roomId) {
    // ฟังการเปลี่ยนแปลงที่ Document ชื่อเดียวกับ roomId
    const docRef = doc(db, "planner_rooms", roomId);

    unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            allData = docSnap.data();
        } else {
            // ถ้าเป็นห้องใหม่ ข้อมูลว่าง
            allData = { calendar: {}, vision: [] };
        }
        
        // เมื่อข้อมูลมา -> สั่งวาดหน้าจอใหม่ทันที
        renderCalendar();
        loadDayData();
        renderVisionBoard();
    });
}

// ฟังก์ชันเซฟขึ้น Cloud (แทน LocalStorage)
async function saveToCloud() {
    if (!currentRoom) return;
    const docRef = doc(db, "planner_rooms", currentRoom);
    await setDoc(docRef, allData, { merge: true });
}

// --- 3. LOGIC (เหมือนเดิมแต่เปลี่ยนที่เก็บข้อมูล) ---
const getDateKey = (date) => date.toISOString().split('T')[0];

function init() {
    checkLogin();
    document.getElementById('today-display').textContent = new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Calendar
function renderCalendar() {
    const container = document.getElementById('calendar-days');
    container.innerHTML = "";
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('current-month-year').textContent = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    for(let i=0; i<firstDayIndex; i++) container.appendChild(document.createElement('div'));
    
    for(let i=1; i<=lastDay; i++) {
        const div = document.createElement('div');
        const dateKey = getDateKey(new Date(year, month, i));
        div.innerHTML = `<span>${i}</span>`;
        
        // เช็คข้อมูลจาก allData.calendar
        const dayData = allData.calendar?.[dateKey];
        if (dayData) {
            if (dayData.mood) div.innerHTML += `<span class="mood-dot">${getMoodEmoji(dayData.mood)}</span>`;
            else if (dayData.tasks && dayData.tasks.length > 0) div.classList.add('has-task');
        }

        if (dateKey === getDateKey(new Date())) div.classList.add('today');
        if (dateKey === getDateKey(selectedDate)) div.classList.add('selected');
        
        div.addEventListener('click', () => {
            selectedDate = new Date(year, month, i);
            renderCalendar();
            loadDayData();
        });
        container.appendChild(div);
    }
    document.getElementById('selected-date-display').textContent = selectedDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Load Data to UI
function loadDayData() {
    const key = getDateKey(selectedDate);
    const dayData = allData.calendar?.[key] || { tasks: [], mood: null, diary: "" };

    // Task List
    const list = document.getElementById('task-list');
    list.innerHTML = "";
    dayData.tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <div class="task-left" onclick="toggleTask(${index})">
                <div class="custom-checkbox"></div><span>${task.text}</span>
            </div>
            <button onclick="deleteTask(${index})" style="background:none; border:none; color:#fab1a0;"><i class="fa-solid fa-trash"></i></button>
        `;
        list.appendChild(li);
    });

    // Mood & Diary UI
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mood === dayData.mood) btn.classList.add('active');
    });
    document.getElementById('diary-input').value = dayData.diary || "";
}

// --- ACTIONS (Update allData -> SaveToCloud) ---
// Helper to init structure
function ensureDateStructure(key) {
    if (!allData.calendar) allData.calendar = {};
    if (!allData.calendar[key]) allData.calendar[key] = { tasks: [], mood: null, diary: "" };
}

document.getElementById('add-task-btn').addEventListener('click', () => {
    const input = document.getElementById('task-input');
    if(!input.value.trim()) return;
    const key = getDateKey(selectedDate);
    ensureDateStructure(key);
    
    allData.calendar[key].tasks.push({ text: input.value, completed: false });
    saveToCloud(); // เซฟทันที
    input.value = "";
});

window.toggleTask = (idx) => {
    const key = getDateKey(selectedDate);
    allData.calendar[key].tasks[idx].completed = !allData.calendar[key].tasks[idx].completed;
    saveToCloud();
};

window.deleteTask = (idx) => {
    const key = getDateKey(selectedDate);
    allData.calendar[key].tasks.splice(idx, 1);
    saveToCloud();
};

window.setMood = (mood) => {
    const key = getDateKey(selectedDate);
    ensureDateStructure(key);
    allData.calendar[key].mood = (allData.calendar[key].mood === mood) ? null : mood;
    saveToCloud();
};

document.getElementById('diary-input').addEventListener('blur', (e) => {
    const key = getDateKey(selectedDate);
    ensureDateStructure(key);
    allData.calendar[key].diary = e.target.value;
    saveToCloud();
});

window.clearDayTasks = () => {
    if(confirm('ลบข้อมูลวันนี้?')) {
        const key = getDateKey(selectedDate);
        if(allData.calendar) delete allData.calendar[key];
        saveToCloud();
    }
};

// Vision Board
window.addVisionItem = () => {
    const url = document.getElementById('vision-url').value;
    const caption = document.getElementById('vision-caption').value;
    if(!url) return;
    
    if(!allData.vision) allData.vision = [];
    allData.vision.push({ url, caption });
    saveToCloud();
    
    document.getElementById('vision-url').value = "";
    document.getElementById('vision-caption').value = "";
};

window.deleteVision = (idx) => {
    if(confirm('ลบรูปนี้?')) {
        allData.vision.splice(idx, 1);
        saveToCloud();
    }
};

function renderVisionBoard() {
    const grid = document.getElementById('vision-grid');
    grid.innerHTML = "";
    const items = allData.vision || [];
    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'vision-item';
        div.innerHTML = `
            <img src="${item.url}" onerror="this.src='https://via.placeholder.com/150'">
            <div class="vision-caption">${item.caption}</div>
            <button class="vision-delete" onclick="deleteVision(${idx})">×</button>
        `;
        grid.appendChild(div);
    });
}

function getMoodEmoji(mood) {
    const map = { happy: '😆', neutral: '😐', tired: '😴', sad: '😢', angry: '😡' };
    return map[mood] || '';
}

document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); });
document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); });

init();