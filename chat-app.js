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

// Auth state observer
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('authModal').classList.add('hidden');
        initializeApp();
    } else {
        currentUser = null;
        document.getElementById('authModal').classList.remove('hidden');
        
        // Clear form fields on logout
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        
        // Clean up listeners
        if (allUsers) {
            database.ref('users').off();
        }
        
        // Reset chat list
        document.getElementById('chatList').innerHTML = '';
        
        // Hide chat window
        document.getElementById('welcomeScreen').classList.remove('hidden');
        document.getElementById('chatHeader').classList.add('hidden');
        document.getElementById('messagesContainer').classList.add('hidden');
        document.getElementById('messageInput').classList.add('hidden');
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
        await database.ref('users/' + currentUser.uid + '/status').set('online');
        
        const userStatusRef = database.ref('users/' + currentUser.uid + '/status');
        database.ref('.info/connected').on('value', snapshot => {
            if (snapshot.val() === true) {
                userStatusRef.onDisconnect().set('offline');
                database.ref('users/' + currentUser.uid + '/lastSeen').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
            }
        });

        const userSnapshot = await database.ref('users/' + currentUser.uid).once('value');
        const userData = userSnapshot.val();
        
        if (userData) {
            document.getElementById('userName').textContent = userData.name;
            document.getElementById('userAvatar').src = userData.avatar;
        }

        loadUsers();
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Error loading chat. Please check your Firebase configuration and database rules.');
    }
}

// Load all users and groups from Firebase
function loadUsers() {
    database.ref('users').on('value', snapshot => {
        allUsers = snapshot.val() || {};
        console.log('Loaded users:', allUsers);
        initChatList();
    }, error => {
        console.error('Error loading users:', error);
        // Only show alert if user is logged in
        if (currentUser) {
            alert('Cannot load users. Please check Firebase database rules.');
        }
    });
}

// Initialize chat list with real users
function initChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';

    const userCount = Object.keys(allUsers).length;

    console.log('Total users:', userCount);

    if (userCount === 0 || (userCount === 1 && allUsers[currentUser.uid])) {
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

    // Add individual users
    // Add individual users
    Object.keys(allUsers).forEach(userId => {
        if (userId === currentUser.uid) return;

        hasOtherUsers = true;

        const user = allUsers[userId];
        
        if (!user || !user.name) {
            console.warn('Invalid user data for:', userId);
            return;
        }

        const chatItem = document.createElement('div');
        chatItem.className = 'flex items-center p-4 hover:bg-gray-100 cursor-pointer border-b border-gray-200 transition';
        chatItem.onclick = () => openChat(userId);

        const isOnline = user.status === 'online';
        const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-400';
        const aboutText = user.about && user.about.trim() ? user.about : (isOnline ? '● online' : 'offline');

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
                        ${aboutText}
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
    if (currentChatId && messageListeners[currentChatId]) {
        const chatPath = getChatPath(currentChatId);
        const listener = messageListeners[currentChatId];
        
        // Remove old listeners
        if (typeof listener === 'object') {
            database.ref(chatPath).off('child_added', listener.add);
            database.ref(chatPath).off('child_changed', listener.change);
        } else {
            database.ref(chatPath).off('child_added', listener);
        }
    }

    currentChatId = userId;
    const user = allUsers[userId];

    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('messagesContainer').classList.remove('hidden');
    document.getElementById('messageInput').classList.remove('hidden');

    showChatWindow();

    document.getElementById('chatAvatar').src = user.avatar;
    document.getElementById('chatName').textContent = user.name;
    
    // Display about status if available
    const aboutElement = document.getElementById('chatAbout');
    if (user.about && user.about.trim()) {
        aboutElement.textContent = user.about;
        aboutElement.classList.remove('hidden');
    } else {
        aboutElement.classList.add('hidden');
    }
    
    const isOnline = user.status === 'online';
    document.getElementById('chatStatus').textContent = isOnline ? 'online' : 'offline';
    document.getElementById('chatStatus').className = 'text-xs ' + (isOnline ? 'text-green-500' : 'text-gray-500');

    loadMessages(userId);
}

// Mobile navigation functions
function showChatWindow() {
    if (window.innerWidth < 768) {
        document.getElementById('chatSidebar').classList.add('hidden-mobile');
        document.getElementById('chatWindow').classList.remove('hidden-mobile');
        // Force display
        document.getElementById('chatWindow').style.display = 'flex';
    }
}

function showChatList() {
    if (window.innerWidth < 768) {
        document.getElementById('chatSidebar').classList.remove('hidden-mobile');
        document.getElementById('chatWindow').classList.add('hidden-mobile');
        // Force display
        document.getElementById('chatSidebar').style.display = 'flex';
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        document.getElementById('chatSidebar').classList.remove('hidden-mobile');
        document.getElementById('chatWindow').classList.remove('hidden-mobile');
        document.getElementById('chatSidebar').style.display = '';
        document.getElementById('chatWindow').style.display = '';
    } else {
        // On mobile, show sidebar by default if no chat is open
        if (!currentChatId) {
            showChatList();
        }
    }
});

// Get chat path
function getChatPath(otherUserId) {
    const ids = [currentUser.uid, otherUserId].sort();
    return 'chats/' + ids[0] + '_' + ids[1] + '/messages';
}

// Load messages from Firebase
function loadMessages(userId) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    const chatPath = getChatPath(userId);
    
    // Load all existing messages
    database.ref(chatPath).orderByChild('timestamp').once('value', snapshot => {
        snapshot.forEach(childSnapshot => {
            const message = childSnapshot.val();
            const messageId = childSnapshot.key;
            
            if (message.type === 'file') {
                addFileToUI(message, message.senderId === currentUser.uid, formatTime(message.timestamp), messageId, chatPath);
            } else {
                addMessageToUI(
                    message.text,
                    message.senderId === currentUser.uid,
                    formatTime(message.timestamp),
                    message.readBy,
                    messageId,
                    chatPath
                );
            }
            
            if (message.senderId !== currentUser.uid) {
                // Mark as delivered when loading chat
                markAsDelivered(messageId, chatPath);
                // Mark as read only after a short delay to ensure user is viewing
                setTimeout(() => {
                    markAsRead(messageId, chatPath);
                }, 500);
            }
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // Listen for new messages
    const addListener = database.ref(chatPath).on('child_added', snapshot => {
        const message = snapshot.val();
        const messageId = snapshot.key;
        
        if (message.timestamp > Date.now() - 1000) {
            if (message.type === 'file') {
                addFileToUI(message, message.senderId === currentUser.uid, formatTime(message.timestamp), messageId, chatPath);
            } else {
                addMessageToUI(
                    message.text,
                    message.senderId === currentUser.uid,
                    formatTime(message.timestamp),
                    message.readBy,
                    messageId,
                    chatPath
                );
            }
            
            if (message.senderId !== currentUser.uid) {
                // Mark as delivered when recipient receives message (but not read yet)
                markAsDelivered(messageId, chatPath);
            }
        }
    });

    // Listen for message updates (read receipts)
    const changeListener = database.ref(chatPath).on('child_changed', snapshot => {
        const message = snapshot.val();
        const messageId = snapshot.key;
        
        // Update the message in UI if it exists
        if (message.senderId === currentUser.uid) {
            updateMessageReadStatus(messageId, message.readBy);
        }
    });

    messageListeners[userId] = { add: addListener, change: changeListener };
    listenForTyping(userId);
}

// Update message read status in real-time
function updateMessageReadStatus(messageId, readBy) {
    const messagesContainer = document.getElementById('messagesContainer');
    const checkIcon = messagesContainer.querySelector('[data-message-id="' + messageId + '"]');
    
    if (checkIcon) {
        const readByCount = readBy ? Object.keys(readBy).length : 1;
        const isRead = readByCount > 1;
        const isDelivered = readByCount > 1 || (readBy && readBy.delivered);
        
        const recipientStatus = currentChatId && allUsers[currentChatId] ? allUsers[currentChatId].status : 'offline';
        const recipientOnline = recipientStatus === 'online';
        
        // Remove all existing classes
        checkIcon.classList.remove('fa-check', 'fa-check-double', 'text-gray-400', 'text-blue-500');
        
        if (isRead) {
            // Double blue tick - message read
            checkIcon.classList.add('fa-check-double', 'text-blue-500');
        } else if (isDelivered || recipientOnline) {
            // Double gray tick - delivered but not read
            checkIcon.classList.add('fa-check-double', 'text-gray-400');
        } else {
            // Single gray tick - sent but not delivered
            checkIcon.classList.add('fa-check', 'text-gray-400');
        }
    }
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Add message to UI
function addMessageToUI(text, isSent, time, readBy, messageId, chatPath) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex mb-4 group ' + (isSent ? 'justify-end' : 'justify-start');

    const deleteButton = isSent && messageId ? `<button onclick="deleteMessage('${messageId}', '${chatPath}')" class="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700" title="Delete message"><i class="fas fa-trash text-sm"></i></button>` : '';

    let tickMarkHtml = '';
    if (isSent && messageId) {
        const readByCount = readBy ? Object.keys(readBy).length : 1;
        const isRead = readByCount > 1;
        const isDelivered = readByCount > 1 || (readBy && readBy.delivered);
        
        // Check if recipient is online for delivered status
        const recipientStatus = currentChatId && allUsers[currentChatId] ? allUsers[currentChatId].status : 'offline';
        const recipientOnline = recipientStatus === 'online';
        
        if (isRead) {
            // Double blue tick - message read
            tickMarkHtml = `<i class="fas fa-check-double text-blue-500 text-xs" data-message-id="${messageId}"></i>`;
        } else if (isDelivered || recipientOnline) {
            // Double gray tick - delivered but not read
            tickMarkHtml = `<i class="fas fa-check-double text-gray-400 text-xs" data-message-id="${messageId}"></i>`;
        } else {
            // Single gray tick - sent but not delivered (recipient offline)
            tickMarkHtml = `<i class="fas fa-check text-gray-400 text-xs" data-message-id="${messageId}"></i>`;
        }
    }

    messageDiv.innerHTML = `
        <div class="${isSent ? 'bg-green-100' : 'bg-white'} rounded-lg px-4 py-2 max-w-md shadow relative">
            ${deleteButton}
            <p class="text-sm">${escapeHtml(text)}</p>
            <div class="flex items-center justify-end mt-1 space-x-1">
                <span class="text-xs text-gray-500">${time}</span>
                ${tickMarkHtml}
            </div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add file to UI
function addFileToUI(fileMessage, isSent, time, messageId, chatPath) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex mb-4 group ' + (isSent ? 'justify-end' : 'justify-start');

    const isImage = fileMessage.fileType.startsWith('image/');
    
    const deleteButton = isSent && messageId ? `<button onclick="deleteMessage('${messageId}', '${chatPath}')" class="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700" title="Delete message"><i class="fas fa-trash text-sm"></i></button>` : '';
    
    let fileHtml = '';
    if (isImage) {
        fileHtml = '<img src="' + fileMessage.fileData + '" alt="' + fileMessage.fileName + '" class="max-w-xs rounded mb-2 cursor-pointer" onclick="window.open(\'' + fileMessage.fileData + '\', \'_blank\')">';
    } else {
        fileHtml = '<a href="' + fileMessage.fileData + '" download="' + fileMessage.fileName + '" class="flex items-center text-blue-500 hover:text-blue-700"><i class="fas fa-file mr-2"></i><span class="text-sm">' + fileMessage.fileName + '</span></a>';
    }
    
    let tickMarkHtml = '';
    if (isSent && messageId) {
        const readByCount = fileMessage.readBy ? Object.keys(fileMessage.readBy).length : 1;
        const isRead = readByCount > 1;
        const isDelivered = readByCount > 1 || (fileMessage.readBy && fileMessage.readBy.delivered);
        
        const recipientStatus = currentChatId && allUsers[currentChatId] ? allUsers[currentChatId].status : 'offline';
        const recipientOnline = recipientStatus === 'online';
        
        if (isRead) {
            tickMarkHtml = `<i class="fas fa-check-double text-blue-500 text-xs" data-message-id="${messageId}"></i>`;
        } else if (isDelivered || recipientOnline) {
            tickMarkHtml = `<i class="fas fa-check-double text-gray-400 text-xs" data-message-id="${messageId}"></i>`;
        } else {
            tickMarkHtml = `<i class="fas fa-check text-gray-400 text-xs" data-message-id="${messageId}"></i>`;
        }
    }
    
    messageDiv.innerHTML = `
        <div class="${isSent ? 'bg-green-100' : 'bg-white'} rounded-lg px-4 py-2 max-w-md shadow relative">
            ${deleteButton}
            ${fileHtml}
            <div class="flex items-center justify-end mt-1 space-x-1">
                <span class="text-xs text-gray-500">${time}</span>
                ${tickMarkHtml}
            </div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Escape HTML
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
        const timestamp = Date.now();
        const chatPath = getChatPath(currentChatId);
        
        const readByObj = {};
        readByObj[currentUser.uid] = true;
        
        await database.ref(chatPath).push({
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            timestamp: timestamp,
            readBy: readByObj
        });

        const ids = [currentUser.uid, currentChatId].sort();
        const chatMetaPath = 'chats/' + ids[0] + '_' + ids[1] + '/metadata';
        await database.ref(chatMetaPath).set({
            lastMessage: text,
            lastMessageTime: timestamp,
            lastSender: currentUser.uid
        });

        messageText.value = '';
    }
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const chatList = document.getElementById('chatList');
    const chatItems = chatList.children;

    Array.from(chatItems).forEach(item => {
        const name = item.querySelector('h4');
        if (name && name.textContent.toLowerCase().includes(searchTerm)) {
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

// Upload avatar
async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const avatarData = e.target.result;
        
        try {
            await database.ref('users/' + currentUser.uid + '/avatar').set(avatarData);
            document.getElementById('userAvatar').src = avatarData;
            alert('Profile picture updated!');
        } catch (error) {
            alert('Failed to upload: ' + error.message);
        }
    };
    reader.readAsDataURL(file);
}

// Upload file
async function uploadFile(event) {
    const file = event.target.files[0];
    if (!file || !currentChatId) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const fileData = e.target.result;
        const timestamp = Date.now();

        try {
            const chatPath = getChatPath(currentChatId);
            
            const readByObj = {};
            readByObj[currentUser.uid] = true;
            
            await database.ref(chatPath).push({
                type: 'file',
                fileData: fileData,
                fileName: file.name,
                fileType: file.type,
                senderId: currentUser.uid,
                senderName: currentUser.displayName,
                timestamp: timestamp,
                readBy: readByObj
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
    
    database.ref(typingPath).set(true);

    if (typingTimeout) clearTimeout(typingTimeout);

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

// Mark message as delivered
async function markAsDelivered(messageId, chatPath) {
    try {
        await database.ref(chatPath + '/' + messageId + '/readBy/delivered').set(true);
    } catch (error) {
        console.log('Failed to mark as delivered:', error);
    }
}

// Mark message as read
async function markAsRead(messageId, chatPath) {
    try {
        await database.ref(chatPath + '/' + messageId + '/readBy/' + currentUser.uid).set(true);
    } catch (error) {
        console.log('Failed to mark as read:', error);
    }
}

// Delete message
async function deleteMessage(messageId, chatPath) {
    if (confirm('Delete this message?')) {
        try {
            await database.ref(chatPath + '/' + messageId).remove();
            
            // Reload messages to update UI
            const messagesContainer = document.getElementById('messagesContainer');
            const scrollPos = messagesContainer.scrollTop;
            
            loadMessages(currentChatId);
            
            // Restore scroll position
            setTimeout(() => {
                messagesContainer.scrollTop = scrollPos;
            }, 100);
        } catch (error) {
            alert('Failed to delete message: ' + error.message);
        }
    }
}

// Toggle chat menu dropdown
function toggleChatMenu() {
    const menu = document.getElementById('chatMenu');
    menu.classList.toggle('hidden');
}

// Close chat menu when clicking outside
document.addEventListener('click', function(event) {
    const menu = document.getElementById('chatMenu');
    const button = event.target.closest('button');
    
    if (!menu.contains(event.target) && button && !button.onclick.toString().includes('toggleChatMenu')) {
        menu.classList.add('hidden');
    }
});

// Delete all messages in current chat
async function deleteAllMessages() {
    if (!currentChatId) {
        alert('No chat selected');
        return;
    }

    const chatName = document.getElementById('chatName').textContent;
    if (confirm(`Delete all messages in chat with ${chatName}? This cannot be undone.`)) {
        try {
            const chatPath = getChatPath(currentChatId);
            await database.ref(chatPath).remove();
            
            // Clear messages container
            document.getElementById('messagesContainer').innerHTML = '<div class="text-center text-gray-500 mt-8"><i class="fas fa-inbox text-4xl mb-2"></i><p>All messages deleted</p></div>';
            
            // Close menu
            document.getElementById('chatMenu').classList.add('hidden');
            
            alert('All messages deleted successfully');
        } catch (error) {
            alert('Failed to delete messages: ' + error.message);
        }
    }
}

// Toggle chat search bar
function toggleChatSearch() {
    const searchBar = document.getElementById('chatSearchBar');
    const searchInput = document.getElementById('chatSearchInput');
    const menu = document.getElementById('chatMenu');
    
    searchBar.classList.toggle('hidden');
    menu.classList.add('hidden');
    
    if (!searchBar.classList.contains('hidden')) {
        searchInput.focus();
        searchInput.value = '';
        document.getElementById('searchResults').classList.add('hidden');
        clearSearchHighlights();
    } else {
        clearSearchHighlights();
    }
}

// Search in current chat
function searchInChat() {
    const searchTerm = document.getElementById('chatSearchInput').value.trim().toLowerCase();
    const messagesContainer = document.getElementById('messagesContainer');
    const messages = messagesContainer.querySelectorAll('.flex.mb-4');
    const searchResults = document.getElementById('searchResults');
    
    clearSearchHighlights();
    
    if (!searchTerm) {
        searchResults.classList.add('hidden');
        return;
    }
    
    let matchCount = 0;
    
    messages.forEach(messageDiv => {
        const textElement = messageDiv.querySelector('p.text-sm');
        if (textElement) {
            const messageText = textElement.textContent.toLowerCase();
            
            if (messageText.includes(searchTerm)) {
                matchCount++;
                messageDiv.classList.add('search-highlight');
                messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
    
    if (matchCount > 0) {
        searchResults.textContent = `${matchCount} message${matchCount > 1 ? 's' : ''} found`;
        searchResults.classList.remove('hidden');
    } else {
        searchResults.textContent = 'No messages found';
        searchResults.classList.remove('hidden');
    }
}

// Clear search highlights
function clearSearchHighlights() {
    const highlightedMessages = document.querySelectorAll('.search-highlight');
    highlightedMessages.forEach(msg => {
        msg.classList.remove('search-highlight');
    });
}

// Settings Functions

// Open settings modal
function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    loadSettingsData();
}

// Close settings modal
function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// Load current user data into settings
async function loadSettingsData() {
    if (!currentUser) return;
    
    try {
        const userSnapshot = await database.ref('users/' + currentUser.uid).once('value');
        const userData = userSnapshot.val();
        
        if (userData) {
            document.getElementById('settingsAvatar').src = userData.avatar || currentUser.photoURL;
            document.getElementById('settingsName').value = userData.name || currentUser.displayName;
            document.getElementById('settingsEmail').value = userData.email || currentUser.email;
            document.getElementById('settingsAbout').value = userData.about || '';
            updateAboutCharCount();
            
            // Account info
            if (currentUser.metadata.creationTime) {
                const createdDate = new Date(currentUser.metadata.creationTime);
                document.getElementById('accountCreated').textContent = createdDate.toLocaleDateString();
            }
            
            if (userData.lastSeen) {
                const lastSeen = new Date(userData.lastSeen);
                document.getElementById('lastSeenTime').textContent = lastSeen.toLocaleString();
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Update display name
async function updateDisplayName() {
    const newName = document.getElementById('settingsName').value.trim();
    
    if (!newName) {
        throw new Error('Please enter a name');
    }
    
    if (newName.length < 2) {
        throw new Error('Name must be at least 2 characters');
    }
    
    // Update Firebase Auth profile
    await currentUser.updateProfile({ displayName: newName });
    
    // Update database
    await database.ref('users/' + currentUser.uid + '/name').set(newName);
    
    // Update UI
    document.getElementById('userName').textContent = newName;
}

// Update profile photo from settings
async function updateProfilePhoto(event) {
    const file = event.target.files[0];
    if (!file || !currentUser) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const avatarData = e.target.result;
        
        try {
            await database.ref('users/' + currentUser.uid + '/avatar').set(avatarData);
            
            // Update all avatar displays
            document.getElementById('userAvatar').src = avatarData;
            document.getElementById('settingsAvatar').src = avatarData;
            
            // Reload users to update chat list
            loadUsers();
            
            alert('Profile picture updated successfully!');
        } catch (error) {
            alert('Failed to upload: ' + error.message);
        }
    };
    reader.readAsDataURL(file);
}

// Update about/status
async function updateAbout() {
    const about = document.getElementById('settingsAbout').value.trim();
    
    if (about.length > 139) {
        throw new Error('About must be 139 characters or less');
    }
    
    await database.ref('users/' + currentUser.uid + '/about').set(about);
}

// Save all settings at once
async function saveAllSettings() {
    try {
        // Show loading state
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
        
        // Update name
        await updateDisplayName();
        
        // Update about
        await updateAbout();
        
        // Reload users to update UI everywhere
        loadUsers();
        
        // Success feedback
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Saved!';
        btn.classList.remove('bg-green-500', 'hover:bg-green-600');
        btn.classList.add('bg-green-600');
        
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.add('bg-green-500', 'hover:bg-green-600');
            btn.classList.remove('bg-green-600');
        }, 2000);
        
    } catch (error) {
        alert('Failed to save settings: ' + error.message);
        const btn = event.target;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-floppy-disk mr-2"></i>Save Changes';
    }
}

// Update about character count
function updateAboutCharCount() {
    const aboutInput = document.getElementById('settingsAbout');
    const charCount = document.getElementById('aboutCharCount');
    
    if (aboutInput && charCount) {
        charCount.textContent = aboutInput.value.length + '/139 characters';
    }
}

// Toggle notifications
function toggleNotifications() {
    const isEnabled = document.getElementById('notificationsToggle').checked;
    
    if (isEnabled) {
        if ('Notification' in window) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    localStorage.setItem('notificationsEnabled', 'true');
                    alert('Notifications enabled!');
                } else {
                    document.getElementById('notificationsToggle').checked = false;
                    alert('Please allow notifications in your browser settings');
                }
            });
        } else {
            document.getElementById('notificationsToggle').checked = false;
            alert('Notifications are not supported in this browser');
        }
    } else {
        localStorage.setItem('notificationsEnabled', 'false');
        alert('Notifications disabled');
    }
}

// Delete account
async function deleteAccount() {
    const confirmation = prompt('This will permanently delete your account and all data. Type DELETE to confirm:');
    
    if (confirmation !== 'DELETE') {
        alert('Account deletion cancelled');
        return;
    }
    
    try {
        // Delete user data from database
        await database.ref('users/' + currentUser.uid).remove();
        
        // Delete all chats involving this user
        const chatsSnapshot = await database.ref('chats').once('value');
        const chats = chatsSnapshot.val() || {};
        
        for (let chatId in chats) {
            if (chatId.includes(currentUser.uid)) {
                await database.ref('chats/' + chatId).remove();
            }
        }
        
        // Delete Firebase Auth account
        await currentUser.delete();
        
        alert('Account deleted successfully');
        closeSettings();
    } catch (error) {
        alert('Failed to delete account: ' + error.message + '. You may need to re-login and try again.');
    }
}

// Add event listener for about character count
document.addEventListener('DOMContentLoaded', function() {
    const aboutInput = document.getElementById('settingsAbout');
    if (aboutInput) {
        aboutInput.addEventListener('input', updateAboutCharCount);
    }
});
