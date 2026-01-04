// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBo5-H7HwHoQM6psmoPRqATbO9Tm2wKqbM",
    authDomain: "chat-app-9f4f1.firebaseapp.com",
    databaseURL: "https://chat-app-9f4f1-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chat-app-9f4f1",
    storageBucket: "chat-app-9f4f1.firebasestorage.app",
    messagingSenderId: "1050509061690",
    appId: "1:1050509061690:web:23b1e2418fb73ed6900f03",
    measurementId: "G-HJM443F5YG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

let currentUser = null;
let currentChatId = null;
let allUsers = {};
let messageListeners = {};
let typingTimeout = null;
let selectedMembers = [];

// Auth state observer
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('authModal').classList.add('hidden');
        initializeApp();
    } else {
        document.getElementById('authModal').classList.remove('hidden');
    }
});

// Show/Hide auth forms
function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('authError').classList.add('hidden');
}

function showLogin() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('authError').classList.add('hidden');
}

function showError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

// Register new user
async function register() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;

    if (!name || !email || !password) {
        showError('Please fill in all fields');
        return;
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Save user profile to database
        await database.ref('users/' + user.uid).set({
            name: name,
            email: email,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
            status: 'online',
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Update display name
        await user.updateProfile({ displayName: name });
    } catch (error) {
        showError(error.message);
    }
}

// Login existing user
async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showError('Please fill in all fields');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        showError(error.message);
    }
}

// Logout
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            // Update status to offline (only if database is available)
            if (currentUser) {
                await database.ref('users/' + currentUser.uid + '/status').set('offline');
                await database.ref('users/' + currentUser.uid + '/lastSeen').set(firebase.database.ServerValue.TIMESTAMP);
            }
        } catch (error) {
            console.log('Database update failed, but continuing logout...');
        }
        await auth.signOut();
    }
}

// Initialize app after login
async function initializeApp() {
    try {
        // Update user status to online
        await database.ref('users/' + currentUser.uid + '/status').set('online');
        
        // Set up presence system
        const userStatusRef = database.ref('users/' + currentUser.uid + '/status');
        database.ref('.info/connected').on('value', snapshot => {
            if (snapshot.val() === true) {
                userStatusRef.onDisconnect().set('offline');
                database.ref('users/' + currentUser.uid + '/lastSeen').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
            }
        });

        // Load current user info
        const userSnapshot = await database.ref('users/' + currentUser.uid).once('value');
        const userData = userSnapshot.val();
        
        if (userData) {
            document.getElementById('userName').textContent = userData.name;
            document.getElementById('userAvatar').src = userData.avatar;
        }

        // Load all users (contacts)
        loadUsers();
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Error loading chat. Please check your Firebase configuration and database rules.');
    }
}

// Load all users from Firebase
function loadUsers() {
    database.ref('users').on('value', snapshot => {
        allUsers = snapshot.val() || {};
        console.log('Loaded users:', allUsers);
        initChatList();
    }, error => {
        console.error('Error loading users:', error);
        alert('Cannot load users. Please check Firebase database rules.');
    });
}

// Initialize chat list with real users
function initChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';

    const userCount = Object.keys(allUsers).length;
    console.log('Total users in database:', userCount);

    if (userCount === 0 || (userCount === 1 && allUsers[currentUser.uid])) {
        // No other users found
        chatList.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <i class="fas fa-users text-4xl mb-3"></i>
                <p class="font-semibold">No users yet</p>
                <p class="text-sm mt-2">Open this app in another browser or device and create a new account to start chatting!</p>
            </div>
        `;
        return;
    }

    let hasOtherUsers = false;

    Object.keys(allUsers).forEach(userId => {
        // Don't show current user in the list
        if (userId === currentUser.uid) return;

        hasOtherUsers = true;

        const user = allUsers[userId];
        
        // Skip if user data is invalid
        if (!user || !user.name) {
            console.warn('Invalid user data for:', userId);
            return;
        }

        const chatItem = document.createElement('div');
        chatItem.className = 'flex items-center p-4 hover:bg-gray-100 cursor-pointer border-b border-gray-200 transition';
        chatItem.onclick = () => openChat(userId);

        const isOnline = user.status === 'online';
        const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-400';

        chatItem.innerHTML = `
            <div class="relative">
                <img src="${user.avatar}" alt="${user.name}" class="w-12 h-12 rounded-full mr-3">
                <span class="${statusColor} w-3 h-3 rounded-full absolute bottom-0 right-3 border-2 border-white"></span>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-baseline">
                    <h4 class="font-semibold truncate">${user.name}</h4>
                </div>
                <div class="flex justify-between items-center">
                    <p class="text-sm ${isOnline ? 'text-green-600' : 'text-gray-500'} truncate">
                        ${isOnline ? '● online' : 'offline'}
                    </p>
                </div>
            </div>
        `;

        chatList.appendChild(chatItem);
    });

    if (!hasOtherUsers) {
        chatList.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <i class="fas fa-users text-4xl mb-3"></i>
                <p class="font-semibold">No other users online</p>
                <p class="text-sm mt-2">Create another account in a different browser to test the chat!</p>
            </div>
        `;
    }
}

// Open chat with specific user
function openChat(userId) {
    // Remove previous message listener
    if (currentChatId && messageListeners[currentChatId]) {
        database.ref(getChatPath(currentChatId)).off('child_added', messageListeners[currentChatId]);
    }

    currentChatId = userId;
    const user = allUsers[userId];

    // Hide welcome screen, show chat
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('messagesContainer').classList.remove('hidden');
    document.getElementById('messageInput').classList.remove('hidden');

    // Update header
    document.getElementById('chatAvatar').src = user.avatar;
    document.getElementById('chatName').textContent = user.name;
    
    const isOnline = user.status === 'online';
    document.getElementById('chatStatus').textContent = isOnline ? 'online' : 'offline';
    document.getElementById('chatStatus').className = `text-xs ${isOnline ? 'text-green-500' : 'text-gray-500'}`;

    // Load messages
    loadMessages(userId);
}

// Get chat path (consistent for both users)
function getChatPath(otherUserId) {
    const ids = [currentUser.uid, otherUserId].sort();
    return 'chats/' + ids[0] + '_' + ids[1] + '/messages';
}

// Load messages from Firebase
function loadMessages(userId) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    const chatPath = getChatPath(userId);
    
    // Load existing messages first
    database.ref(chatPath).orderByChild('timestamp').once('value', snapshot => {
        snapshot.forEach(childSnapshot => {
            const message = childSnapshot.val();
            const messageId = childSnapshot.key;
            
            if (message.type === 'file') {
                addFileToUI(message, message.senderId === currentUser.uid, formatTime(message.timestamp));
            } else {
                addMessageToUI(
                    message.text,
                    message.senderId === currentUser.uid,
                    formatTime(message.timestamp),
                    message.readBy
                );
            }
            
            // Mark as read if not sent by current user
            if (message.senderId !== currentUser.uid) {
                markAsRead(messageId, chatPath);
            }
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // Listen for new messages in real-time
    const listener = database.ref(chatPath).orderByChild('timestamp').limitToLast(1).on('child_added', snapshot => {
        const message = snapshot.val();
        const messageId = snapshot.key;
        
        // Avoid duplicating messages from initial load
        if (message.timestamp > Date.now() - 1000) {
            if (message.type === 'file') {
                addFileToUI(message, message.senderId === currentUser.uid, formatTime(message.timestamp));
            } else {
                addMessageToUI(
                    message.text,
                    message.senderId === currentUser.uid,
                    formatTime(message.timestamp),
                    message.readBy
                );
            }
            
            // Mark as read if not sent by current user
            if (message.senderId !== currentUser.uid) {
                markAsRead(messageId, chatPath);
            }
        }
    });

    messageListeners[userId] = listener;
    
    // Listen for typing indicator
    listenForTyping(userId);
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Add message to UI
function addMessageToUI(text, isSent, time, readBy) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex mb-4 ${isSent ? 'justify-end' : 'justify-start'}`;

    const isRead = readBy && Object.keys(readBy).length > 1; // More than just sender

    messageDiv.innerHTML = `
        <div class="${isSent ? 'bg-green-100' : 'bg-white'} rounded-lg px-4 py-2 max-w-md shadow">
            <p class="text-sm">${escapeHtml(text)}</p>
            <div class="flex items-center justify-end mt-1 space-x-1">
                <span class="text-xs text-gray-500">${time}</span>
                ${isSent ? `<i class="fas fa-check-double ${isRead ? 'text-blue-500' : 'text-gray-400'} text-xs"></i>` : ''}
            </div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add file to UI
function addFileToUI(fileMessage, isSent, time) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex mb-4 ${isSent ? 'justify-end' : 'justify-start'}`;

    const isImage = fileMessage.fileType.startsWith('image/');
    
    messageDiv.innerHTML = `
        <div class="${isSent ? 'bg-green-100' : 'bg-white'} rounded-lg px-4 py-2 max-w-md shadow">
            ${isImage ? 
                `<img src="${fileMessage.fileData}" alt="${fileMessage.fileName}" class="max-w-xs rounded mb-2 cursor-pointer" onclick="window.open('${fileMessage.fileData}', '_blank')">` :
                `<a href="${fileMessage.fileData}" download="${fileMessage.fileName}" class="flex items-center text-blue-500 hover:text-blue-700">
                    <i class="fas fa-file mr-2"></i>
                    <span class="text-sm">${fileMessage.fileName}</span>
                </a>`
            }
            <div class="flex items-center justify-end mt-1 space-x-1">
                <span class="text-xs text-gray-500">${time}</span>
                ${isSent ? '<i class="fas fa-check-double text-blue-500 text-xs"></i>' : ''}
            </div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Send message to Firebase
async function sendMessage() {
    const messageText = document.getElementById('messageText');
    const text = messageText.value.trim();

    if (text && currentChatId) {
        const chatPath = getChatPath(currentChatId);
        const timestamp = Date.now();

        // Save message to Firebase
        await database.ref(chatPath).push({
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            timestamp: timestamp
        });

        // Clear input
        messageText.value = '';

        // Update last message in chat metadata
        const ids = [currentUser.uid, currentChatId].sort();
        const chatMetaPath = 'chats/' + ids[0] + '_' + ids[1] + '/metadata';
        await database.ref(chatMetaPath).set({
            lastMessage: text,
            lastMessageTime: timestamp,
            lastSender: currentUser.uid
        });
    }
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const chatList = document.getElementById('chatList');
    const chatItems = chatList.children;

    Array.from(chatItems).forEach(item => {
        const name = item.querySelector('h4')?.textContent.toLowerCase();
        if (name && name.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// Send button click
document.getElementById('sendButton').addEventListener('click', sendMessage);

// Enter key to send
document.getElementById('messageText').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Upload avatar/profile picture
async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const avatarData = e.target.result;
        
        try {
            // Save to database
            await database.ref('users/' + currentUser.uid + '/avatar').set(avatarData);
            document.getElementById('userAvatar').src = avatarData;
            alert('Profile picture updated!');
        } catch (error) {
            alert('Failed to upload: ' + error.message);
        }
    };
    reader.readAsDataURL(file);
}

// Upload file/image in chat
async function uploadFile(event) {
    const file = event.target.files[0];
    if (!file || !currentChatId) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const fileData = e.target.result;
        const chatPath = getChatPath(currentChatId);
        const timestamp = Date.now();

        try {
            await database.ref(chatPath).push({
                type: 'file',
                fileData: fileData,
                fileName: file.name,
                fileType: file.type,
                senderId: currentUser.uid,
                senderName: currentUser.displayName,
                timestamp: timestamp
            });
        } catch (error) {
            alert('Failed to send file: ' + error.message);
        }
    };
    reader.readAsDataURL(file);
}

// Handle typing indicator
function handleTyping() {
    if (!currentChatId) return;

    const typingPath = 'typing/' + getChatPath(currentChatId).replace(/\//g, '_') + '/' + currentUser.uid;
    
    // Set typing status
    database.ref(typingPath).set(true);

    // Clear previous timeout
    if (typingTimeout) clearTimeout(typingTimeout);

    // Remove typing status after 2 seconds
    typingTimeout = setTimeout(() => {
        database.ref(typingPath).set(false);
    }, 2000);
}

// Listen for typing indicator
function listenForTyping(userId) {
    const typingPath = 'typing/' + getChatPath(userId).replace(/\//g, '_') + '/' + userId;
    
    database.ref(typingPath).on('value', snapshot => {
        const isTyping = snapshot.val();
        const indicator = document.getElementById('typingIndicator');
        
        if (isTyping) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    });
}

// Mark message as read
async function markAsRead(messageId, chatPath) {
    try {
        await database.ref(chatPath + '/' + messageId + '/readBy/' + currentUser.uid).set(true);
    } catch (error) {
        console.log('Failed to mark as read:', error);
    }
}

// Show create group modal
function showCreateGroupModal() {
    document.getElementById('groupModal').classList.remove('hidden');
    loadMembersForGroup();
}

// Close group modal
function closeGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
    selectedMembers = [];
}

// Load members for group creation
function loadMembersForGroup() {
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';

    Object.keys(allUsers).forEach(userId => {
        if (userId === currentUser.uid) return;

        const user = allUsers[userId];
        const memberDiv = document.createElement('div');
        memberDiv.className = 'flex items-center p-2 hover:bg-gray-100 rounded cursor-pointer';
        memberDiv.onclick = () => toggleMember(userId, memberDiv);

        memberDiv.innerHTML = `
            <input type="checkbox" id="member_${userId}" class="mr-3">
            <img src="${user.avatar}" alt="${user.name}" class="w-8 h-8 rounded-full mr-2">
            <span>${user.name}</span>
        `;

        membersList.appendChild(memberDiv);
    });
}

// Toggle member selection
function toggleMember(userId, element) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    checkbox.checked = !checkbox.checked;

    if (checkbox.checked) {
        selectedMembers.push(userId);
        element.classList.add('bg-green-50');
    } else {
        selectedMembers = selectedMembers.filter(id => id !== userId);
        element.classList.remove('bg-green-50');
    }
}

// Create group chat
async function createGroup() {
    const groupName = document.getElementById('groupName').value.trim();

    if (!groupName) {
        alert('Please enter a group name');
        return;
    }

    if (selectedMembers.length === 0) {
        alert('Please select at least one member');
        return;
    }

    try {
        const groupId = 'group_' + Date.now();
        const members = [currentUser.uid, ...selectedMembers];

        await database.ref('groups/' + groupId).set({
            name: groupName,
            members: members,
            createdBy: currentUser.uid,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=random`
        });

        closeGroupModal();
        alert('Group created successfully!');
        loadUsers(); // Reload to show group
    } catch (error) {
        alert('Failed to create group: ' + error.message);
    }
}
