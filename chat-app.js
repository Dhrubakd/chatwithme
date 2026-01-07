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
        // Check if email is verified
        if (!user.emailVerified) {
            // Show verification notice
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('verificationNotice').classList.remove('hidden');
            document.getElementById('verificationEmail').textContent = user.email;
            document.getElementById('authModal').classList.remove('hidden');
            return;
        }
        
        currentUser = user;
        document.getElementById('authModal').classList.add('hidden');
        document.getElementById('verificationNotice').classList.add('hidden');
        
        // Update email verified status in database
        database.ref('users/' + user.uid + '/emailVerified').set(true);
        
        initializeApp();
    } else {
        currentUser = null;
        document.getElementById('authModal').classList.remove('hidden');
        document.getElementById('verificationNotice').classList.add('hidden');
        
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
        document.getElementById('welcomeScreen').classList.remove('hide');
        document.getElementById('chatHeader').classList.remove('show');
        document.getElementById('messagesContainer').classList.remove('show');
        document.getElementById('messageInput').classList.remove('show');
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
            status: 'offline',
            emailVerified: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Update display name
        await user.updateProfile({ displayName: name });
        
        // Send verification email
        await user.sendEmailVerification();
        
        // Show verification notice
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('verificationNotice').classList.remove('hidden');
        document.getElementById('verificationEmail').textContent = email;
        document.getElementById('authError').classList.add('hidden');
        
        // Show success message and redirect to login after 3 seconds
        const successMsg = document.createElement('div');
        successMsg.className = 'mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-center';
        successMsg.innerHTML = `
            <i class="fas fa-check-circle text-green-600 text-2xl mb-2"></i>
            <p class="text-green-800 font-semibold">Registration Successful!</p>
            <p class="text-sm text-green-700 mt-1">Verification email sent to ${email}</p>
            <p class="text-xs text-green-600 mt-2">Redirecting to login page in <span id="countdown">3</span> seconds...</p>
        `;
        document.getElementById('verificationNotice').appendChild(successMsg);
        
        // Sign out the user until they verify
        await auth.signOut();
        
        // Countdown and redirect
        let countdown = 3;
        const countdownElement = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                // Redirect to login
                document.getElementById('verificationNotice').classList.add('hidden');
                document.getElementById('loginForm').classList.remove('hidden');
                document.getElementById('registerForm').classList.add('hidden');
                // Pre-fill email
                document.getElementById('loginEmail').value = email;
            }
        }, 1000);
        
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
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Check if email is verified
        if (!user.emailVerified) {
            showError('Please verify your email before logging in. Check your inbox for the verification link.');
            await auth.signOut();
        }
    } catch (error) {
        showError(error.message);
    }
}

// Resend verification email
async function resendVerificationEmail() {
    try {
        const user = auth.currentUser;
        if (!user) {
            showError('No user logged in');
            return;
        }
        
        await user.sendEmailVerification();
        showSuccessModal('Verification email sent! Please check your inbox.');
    } catch (error) {
        showError('Failed to send verification email: ' + error.message);
    }
}

// Check if email is verified
async function checkEmailVerified() {
    try {
        const user = auth.currentUser;
        if (!user) {
            // Try to get the last registered email and ask user to login
            document.getElementById('verificationNotice').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            showError('Please login with your verified email');
            return;
        }
        
        // Reload user to get fresh email verification status
        await user.reload();
        
        if (user.emailVerified) {
            // Email is verified, proceed to app
            document.getElementById('verificationNotice').classList.add('hidden');
            document.getElementById('authModal').classList.add('hidden');
            
            // Update database
            await database.ref('users/' + user.uid + '/emailVerified').set(true);
            await database.ref('users/' + user.uid + '/status').set('online');
            
            currentUser = user;
            initializeApp();
        } else {
            showError('Email not verified yet. Please check your inbox and click the verification link.');
        }
    } catch (error) {
        showError('Failed to check verification: ' + error.message);
    }
}

// Logout
async function logout() {
    // Close sidebar menu first
    const sidebarMenu = document.getElementById('sidebarMenu');
    if (sidebarMenu) {
        sidebarMenu.classList.add('hidden');
    }
    
    showConfirmModal(
        'Logout',
        'Are you sure you want to logout?',
        async () => {
            try {
                if (currentUser) {
                    await database.ref('users/' + currentUser.uid + '/status').set('offline');
                    await database.ref('users/' + currentUser.uid + '/lastSeen').set(firebase.database.ServerValue.TIMESTAMP);
                }
            } catch (error) {
                console.log('Database update failed, but continuing logout...');
            }
            
            await auth.signOut();
            document.getElementById('authModal').classList.remove('hidden');
            document.getElementById('chatApp').style.display = 'none';
            currentUser = null;
            currentChatId = null;
        }
    );
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
        loadContacts();

        // Default to chats view after login/refresh
        showChatsView();
    } catch (error) {
        console.error('Error initializing app:', error);
        showSuccessModal('Error loading chat. Please check your Firebase configuration and database rules.');
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
        // Only show modal if user is logged in
        if (currentUser) {
            showSuccessModal('Cannot load users. Please check Firebase database rules.');
        }
    });
}

// Initialize chat list with real users
function initChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';

    const contactCount = Object.keys(userContacts).length;

    console.log('Total contacts:', contactCount);

    if (contactCount === 0) {
        chatList.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <i class="fas fa-user-plus text-4xl mb-3"></i>
                <p class="font-semibold">No contacts yet</p>
                <p class="text-sm mt-2 mb-4">Add contacts to start chatting with them!</p>
                <button onclick="openAddContactModal()" class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg">
                    <i class="fas fa-user-plus mr-2"></i>Add Contact
                </button>
            </div>
        `;
        return;
    }

    // Add contacts to chat list
    Object.keys(userContacts).forEach(userId => {
        const contact = userContacts[userId];
        const user = allUsers[userId];
        
        if (!contact || !contact.name) {
            console.warn('Invalid contact data for:', userId);
            return;
        }

        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item flex items-center p-4 hover:bg-gray-100 border-b border-gray-200 transition relative';
        chatItem.dataset.userId = userId;

        // Use real-time user data if available, otherwise use cached contact data
        const displayAvatar = user?.avatar || contact.avatar;
        const displayName = user?.name || contact.name;
        const isOnline = user?.status === 'online';
        const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-400';
        const statusText = isOnline ? 'online' : 'offline';

        chatItem.innerHTML = `
            <div class="relative cursor-pointer" onclick="openChat('${userId}')">
                <img src="${displayAvatar}" alt="${displayName}" class="w-12 h-12 rounded-full mr-3">
                <span class="${statusColor} w-3 h-3 rounded-full absolute bottom-0 right-3 border-2 border-white"></span>
            </div>
            <div class="flex-1 min-w-0 cursor-pointer" onclick="openChat('${userId}')">
                <div class="flex justify-between items-baseline">
                    <h4 class="font-semibold truncate">${displayName}</h4>
                </div>
                <div class="flex justify-between items-center">
                    <p class="text-sm ${isOnline ? 'text-green-600' : 'text-gray-500'} truncate">
                        ${statusText}
                    </p>
                </div>
            </div>
            <div class="relative">
                <button onclick="event.stopPropagation(); toggleContactMenu('${userId}')" class="contact-menu-btn p-2 hover:bg-gray-200 rounded-full transition" title="More options">
                    <i class="fas fa-ellipsis-vertical text-gray-600"></i>
                </button>
                <div id="contactMenu-${userId}" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <button onclick="event.stopPropagation(); viewContactInfo('${userId}')" class="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 flex items-center space-x-3 rounded-t-lg">
                        <i class="fas fa-circle-info"></i>
                        <span>Contact Info</span>
                    </button>
                    <button onclick="event.stopPropagation(); deleteContact('${userId}')" class="w-full text-left px-4 py-3 hover:bg-gray-100 text-red-600 flex items-center space-x-3">
                        <i class="fas fa-trash"></i>
                        <span>Delete Contact</span>
                    </button>
                    <button onclick="event.stopPropagation(); blockContact('${userId}')" class="w-full text-left px-4 py-3 hover:bg-gray-100 text-red-600 flex items-center space-x-3 rounded-b-lg">
                        <i class="fas fa-ban"></i>
                        <span>Block Contact</span>
                    </button>
                </div>
            </div>
        `;

        chatList.appendChild(chatItem);
    });
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
            if (listener.status) {
                database.ref('users/' + currentChatId + '/status').off('value', listener.status);
            }
        } else {
            database.ref(chatPath).off('child_added', listener);
        }
    }

    currentChatId = userId;
    const user = allUsers[userId];

    // Hide welcome screen and show chat elements
    document.getElementById('welcomeScreen').classList.add('hide');
    document.getElementById('chatHeader').classList.add('show');
    document.getElementById('messagesContainer').classList.add('show');
    document.getElementById('messageInput').classList.add('show');

    showChatWindow();

    document.getElementById('chatAvatar').src = user.avatar;
    document.getElementById('chatName').textContent = user.name;
    
    // Only show online/offline status in chat header
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
    }
}

function showChatList() {
    if (window.innerWidth < 768) {
        document.getElementById('chatSidebar').classList.remove('hidden-mobile');
        document.getElementById('chatWindow').classList.add('hidden-mobile');
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        document.getElementById('chatSidebar').classList.remove('hidden-mobile');
        document.getElementById('chatWindow').classList.remove('hidden-mobile');
    } else {
        // On mobile, show sidebar by default if no chat is open
        if (!currentChatId) {
            showChatList();
        } else {
            showChatWindow();
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
            
            // Only mark as read if message is from the other user and hasn't been read yet
            if (message.senderId !== currentUser.uid && message.readBy && !message.readBy[currentUser.uid]) {
                // Mark as read instantly
                markAsRead(messageId, chatPath);
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
            
            // Only mark as read if it's from the other user AND this chat is currently open
            if (message.senderId !== currentUser.uid && currentChatId === message.senderId) {
                markAsRead(messageId, chatPath);
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

    // Listen for recipient status changes to update tick marks in real-time
    const statusListener = database.ref('users/' + userId + '/status').on('value', snapshot => {
        const recipientStatus = snapshot.val();
        
        // Update allUsers cache with latest status
        if (allUsers[userId]) {
            allUsers[userId].status = recipientStatus;
        }
        
        // Update chat header status if this is the current chat
        if (currentChatId === userId) {
            const isOnline = recipientStatus === 'online';
            const chatStatusElement = document.getElementById('chatStatus');
            if (chatStatusElement) {
                chatStatusElement.textContent = isOnline ? 'online' : 'offline';
                chatStatusElement.className = 'text-xs ' + (isOnline ? 'text-green-500' : 'text-gray-500');
            }
        }
        
        // Update all message tick marks for messages sent by current user
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.querySelectorAll('[data-message-id]').forEach(checkIcon => {
                const messageId = checkIcon.getAttribute('data-message-id');
                
                // Get message data to check readBy status
                database.ref(chatPath + '/' + messageId).once('value', msgSnapshot => {
                    const message = msgSnapshot.val();
                    if (message && message.senderId === currentUser.uid) {
                        updateMessageReadStatus(messageId, message.readBy);
                    }
                });
            });
        }
    });

    messageListeners[userId] = { add: addListener, change: changeListener, status: statusListener };
    listenForTyping(userId);
}

// Update message read status in real-time
function updateMessageReadStatus(messageId, readBy) {
    const messagesContainer = document.getElementById('messagesContainer');
    const checkIcon = messagesContainer.querySelector('[data-message-id="' + messageId + '"]');
    
    if (!checkIcon || !currentChatId) return;
    
    // Check if recipient has read the message
    // readBy format: { senderUID: true, recipientUID: true (only if message was opened/read) }
    const recipientHasRead = readBy && readBy[currentChatId] === true;
    
    // Check recipient's current online status
    const recipientStatus = allUsers[currentChatId] ? allUsers[currentChatId].status : 'offline';
    const recipientIsOnline = recipientStatus === 'online';
    
    // Remove all existing tick classes
    checkIcon.classList.remove('fa-check', 'fa-check-double', 'text-gray-400', 'text-blue-500');
    
    // Priority: Read status > Online status
    if (recipientHasRead) {
        // Message was read - DOUBLE BLUE TICK
        checkIcon.classList.add('fa-check-double', 'text-blue-500');
    } else if (recipientIsOnline) {
        // Recipient is online but hasn't read - DOUBLE GRAY TICK
        checkIcon.classList.add('fa-check-double', 'text-gray-400');
    } else {
        // Recipient is offline and hasn't read - SINGLE GRAY TICK
        checkIcon.classList.add('fa-check', 'text-gray-400');
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
    if (isSent && messageId && currentChatId) {
        // Check if recipient has read the message
        const recipientHasRead = readBy && readBy[currentChatId] === true;
        
        // Check recipient's current online status
        const recipientStatus = allUsers[currentChatId] ? allUsers[currentChatId].status : 'offline';
        const recipientIsOnline = recipientStatus === 'online';
        
        if (recipientHasRead) {
            // Message was read - DOUBLE BLUE TICK
            tickMarkHtml = `<i class="fas fa-check-double text-blue-500 text-xs" data-message-id="${messageId}"></i>`;
        } else if (recipientIsOnline) {
            // Recipient online but not read - DOUBLE GRAY TICK
            tickMarkHtml = `<i class="fas fa-check-double text-gray-400 text-xs" data-message-id="${messageId}"></i>`;
        } else {
            // Recipient offline - SINGLE GRAY TICK
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
    const isVideo = fileMessage.fileType.startsWith('video/');
    
    const deleteButton = isSent && messageId ? `<button onclick="deleteMessage('${messageId}', '${chatPath}')" class="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700" title="Delete message"><i class="fas fa-trash text-sm"></i></button>` : '';
    
    let fileHtml = '';
    if (isImage) {
        fileHtml = '<img src="' + fileMessage.fileData + '" alt="' + fileMessage.fileName + '" class="max-w-xs rounded mb-2 cursor-pointer" onclick="window.open(\'' + fileMessage.fileData + '\', \'_blank\')">';
    } else if (isVideo) {
        fileHtml = '<video controls class="max-w-xs rounded mb-2" style="max-height: 400px;"><source src="' + fileMessage.fileData + '" type="' + fileMessage.fileType + '">Your browser does not support video playback.</video>';
    } else {
        fileHtml = '<a href="' + fileMessage.fileData + '" download="' + fileMessage.fileName + '" class="flex items-center text-blue-500 hover:text-blue-700"><i class="fas fa-file mr-2"></i><span class="text-sm">' + fileMessage.fileName + '</span></a>';
    }
    
    let tickMarkHtml = '';
    if (isSent && messageId && currentChatId) {
        // Check if recipient has read the message
        const recipientHasRead = fileMessage.readBy && fileMessage.readBy[currentChatId] === true;
        
        // Check recipient's current online status
        const recipientStatus = allUsers[currentChatId] ? allUsers[currentChatId].status : 'offline';
        const recipientIsOnline = recipientStatus === 'online';
        
        if (recipientHasRead) {
            // Message was read - DOUBLE BLUE TICK
            tickMarkHtml = `<i class="fas fa-check-double text-blue-500 text-xs" data-message-id="${messageId}"></i>`;
        } else if (recipientIsOnline) {
            // Recipient online but not read - DOUBLE GRAY TICK
            tickMarkHtml = `<i class="fas fa-check-double text-gray-400 text-xs" data-message-id="${messageId}"></i>`;
        } else {
            // Recipient offline - SINGLE GRAY TICK
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

    if (!text) {
        console.log('Message is empty');
        return;
    }

    if (!currentChatId) {
        console.error('No chat selected');
        alert('Please select a chat first');
        return;
    }

    if (!currentUser) {
        console.error('User not authenticated');
        alert('You must be logged in to send messages');
        return;
    }

    try {
        const timestamp = Date.now();
        const chatPath = getChatPath(currentChatId);
        
        const readByObj = {};
        readByObj[currentUser.uid] = true;
        
        // Get user display name from database if not available
        let senderName = currentUser.displayName;
        if (!senderName) {
            const userSnapshot = await database.ref('users/' + currentUser.uid + '/name').once('value');
            senderName = userSnapshot.val() || currentUser.email || 'Anonymous';
        }
        
        await database.ref(chatPath).push({
            text: text,
            senderId: currentUser.uid,
            senderName: senderName,
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
        console.log('Message sent successfully');
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message: ' + error.message);
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

// Toggle emoji picker
function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    emojiPicker.classList.toggle('hidden');
}

// Insert emoji into message input
function insertEmoji(emoji) {
    const messageText = document.getElementById('messageText');
    const currentValue = messageText.value;
    const cursorPosition = messageText.selectionStart;
    
    // Insert emoji at cursor position
    messageText.value = currentValue.substring(0, cursorPosition) + emoji + currentValue.substring(cursorPosition);
    
    // Move cursor after emoji
    messageText.selectionStart = messageText.selectionEnd = cursorPosition + emoji.length;
    messageText.focus();
    
    // Close emoji picker
    document.getElementById('emojiPicker').classList.add('hidden');
}

// Close emoji picker when clicking outside
document.addEventListener('click', function(event) {
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiButton = event.target.closest('button[onclick="toggleEmojiPicker()"]');
    
    if (emojiPicker && !emojiPicker.contains(event.target) && !emojiButton) {
        emojiPicker.classList.add('hidden');
    }
});

// Show success modal
function showSuccessModal(message) {
    const modal = document.getElementById('successModal');
    const messageElement = document.getElementById('successMessage');
    
    messageElement.textContent = message;
    modal.classList.remove('hidden');
    
    // Auto close after 2 seconds
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 2000);
}

// Show confirmation modal
function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleElement = document.getElementById('confirmTitle');
    const messageElement = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    modal.classList.remove('hidden');
    
    // Remove old listener and add new one
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    newOkBtn.onclick = function() {
        modal.classList.add('hidden');
        onConfirm();
    };
}

// Close confirmation modal
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
}

// Show input modal (for prompt replacement)
function showInputModal(title, message, placeholder, onConfirm) {
    const modal = document.getElementById('inputModal');
    const titleElement = document.getElementById('inputTitle');
    const messageElement = document.getElementById('inputMessage');
    const inputField = document.getElementById('inputField');
    const okBtn = document.getElementById('inputOkBtn');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    inputField.placeholder = placeholder;
    inputField.value = '';
    modal.classList.remove('hidden');
    inputField.focus();
    
    // Remove old listener and add new one
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    newOkBtn.onclick = function() {
        const value = inputField.value;
        modal.classList.add('hidden');
        onConfirm(value);
    };
    
    // Allow Enter key to submit
    inputField.onkeypress = function(e) {
        if (e.key === 'Enter') {
            const value = inputField.value;
            modal.classList.add('hidden');
            onConfirm(value);
        }
    };
}

// Close input modal
function closeInputModal() {
    document.getElementById('inputModal').classList.add('hidden');
}

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
            showSuccessModal('Profile picture updated successfully!');
        } catch (error) {
            showSuccessModal('Failed to upload: ' + error.message);
        }
    };
    reader.readAsDataURL(file);
}

// Upload file
async function uploadFile(event) {
    const file = event.target.files[0];
    if (!file || !currentChatId) return;

    // Check file size limit (100 MB)
    const maxSize = 100 * 1024 * 1024; // 100 MB in bytes
    if (file.size > maxSize) {
        showSuccessModal('File is too large! Maximum size is 100 MB.');
        event.target.value = ''; // Reset file input
        return;
    }

    // Show uploading message
    if (file.type.startsWith('video/')) {
        showSuccessModal('Uploading video... Please wait.');
    }

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
            showSuccessModal('Failed to send file: ' + error.message);
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
            showSuccessModal('Failed to delete message: ' + error.message);
        }
    }
}

// Toggle chat menu dropdown
function toggleChatMenu() {
    const menu = document.getElementById('chatMenu');
    menu.classList.toggle('hidden');
}

// Toggle sidebar menu dropdown
function toggleSidebarMenu() {
    const menu = document.getElementById('sidebarMenu');
    menu.classList.toggle('hidden');
}

// Toggle contact menu dropdown
function toggleContactMenu(userId) {
    const menu = document.getElementById('contactMenu-' + userId);
    
    // Close all other contact menus
    document.querySelectorAll('[id^="contactMenu-"]').forEach(m => {
        if (m.id !== 'contactMenu-' + userId) {
            m.classList.add('hidden');
        }
    });
    
    menu.classList.toggle('hidden');
}

// View contact info
function viewContactInfo(userId) {
    toggleContactMenu(userId);
    const contact = userContacts[userId];
    const user = allUsers[userId];
    
    const displayName = user?.name || contact.name;
    const displayEmail = user?.email || contact.email;
    const displayAvatar = user?.avatar || contact.avatar;
    const isOnline = user?.status === 'online';
    const about = user?.about || 'No status';
    
    // Update modal content
    document.getElementById('contactInfoAvatar').src = displayAvatar;
    document.getElementById('contactInfoName').textContent = displayName;
    document.getElementById('contactInfoEmail').textContent = displayEmail;
    document.getElementById('contactInfoStatus').textContent = isOnline ? 'Online' : 'Offline';
    document.getElementById('contactInfoStatusDot').className = `w-3 h-3 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`;
    document.getElementById('contactInfoAbout').textContent = about;
    
    // Show modal
    document.getElementById('contactInfoModal').classList.remove('hidden');
}

// Close contact info modal
function closeContactInfoModal() {
    document.getElementById('contactInfoModal').classList.add('hidden');
}

// Delete contact
async function deleteContact(userId) {
    toggleContactMenu(userId);
    const contact = userContacts[userId];
    const displayName = contact.name;
    
    showConfirmModal(
        `Delete ${displayName}?`,
        `This will remove them from your contact list but won't delete your chat history.`,
        async () => {
            try {
                await database.ref('contacts/' + currentUser.uid + '/' + userId).remove();
                
                // Remove from local cache immediately
                delete userContacts[userId];
                
                // If chat is currently open with this contact, close it
                if (currentChatId === userId) {
                    document.getElementById('welcomeScreen').classList.remove('hide');
                    document.getElementById('chatHeader').classList.remove('show');
                    document.getElementById('messagesContainer').classList.remove('show');
                    document.getElementById('messageInput').classList.remove('show');
                    currentChatId = null;
                }
                
                // Reload contacts to ensure sync
                loadContacts();
                
                showSuccessModal(`${displayName} has been removed from your contacts`);
            } catch (error) {
                console.error('Error deleting contact:', error);
                showSuccessModal('Failed to delete contact. Please try again.');
            }
        }
    );
}

// Block contact
async function blockContact(userId) {
    toggleContactMenu(userId);
    const contact = userContacts[userId];
    
    if (!contact) {
        showSuccessModal('Contact not found');
        return;
    }
    
    const displayName = contact.name;
    
    showConfirmModal(
        `Block ${displayName}?`,
        `Blocked contacts won't appear in your contact list. You can unblock them later from Settings.`,
        async () => {
            try {
                // Add to blocked list with contact info
                await database.ref('blocked/' + currentUser.uid + '/' + userId).set({
                    name: contact.name,
                    email: contact.email,
                    avatar: contact.avatar,
                    blockedAt: firebase.database.ServerValue.TIMESTAMP
                });
                
                // Remove from contacts
                await database.ref('contacts/' + currentUser.uid + '/' + userId).remove();
                
                // If chat is currently open with this contact, close it
                if (currentChatId === userId) {
                    document.getElementById('welcomeScreen').classList.remove('hide');
                    document.getElementById('chatHeader').classList.remove('show');
                    document.getElementById('messagesContainer').classList.remove('show');
                    document.getElementById('messageInput').classList.remove('show');
                    currentChatId = null;
                }
                
                showSuccessModal(`${displayName} has been blocked`);
                
                // Auto-dismiss after 2 seconds
                setTimeout(() => {
                    document.getElementById('successModal').classList.add('hidden');
                }, 2000);
            } catch (error) {
                console.error('Error blocking contact:', error);
                showSuccessModal('Failed to block contact: ' + error.message + '\n\nPlease make sure you have updated your Firebase Database Rules to include the "blocked" section.');
            }
        }
    );
}

// Close menus when clicking outside
document.addEventListener('click', function(event) {
    const chatMenu = document.getElementById('chatMenu');
    const sidebarMenu = document.getElementById('sidebarMenu');
    const button = event.target.closest('button');
    
    // Get button's onclick attribute or function
    const buttonOnclick = button ? (button.getAttribute('onclick') || (button.onclick ? button.onclick.toString() : '')) : '';
    
    // Close chat menu
    if (chatMenu && !chatMenu.contains(event.target) && button && !buttonOnclick.includes('toggleChatMenu')) {
        chatMenu.classList.add('hidden');
    }
    
    // Close sidebar menu
    if (sidebarMenu && !sidebarMenu.contains(event.target) && button && !buttonOnclick.includes('toggleSidebarMenu')) {
        sidebarMenu.classList.add('hidden');
    }
    
    // Close all contact menus
    if (button && !buttonOnclick.includes('toggleContactMenu')) {
        document.querySelectorAll('[id^="contactMenu-"]').forEach(menu => {
            if (!menu.contains(event.target)) {
                menu.classList.add('hidden');
            }
        });
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

// Contact Management Functions
let userContacts = {};
let searchedUser = null;

// Load user's contacts from Firebase
function loadContacts() {
    if (!currentUser) return;
    
    database.ref('contacts/' + currentUser.uid).on('value', snapshot => {
        userContacts = snapshot.val() || {};
        console.log('Loaded contacts:', userContacts);
        initChatList();
    }, error => {
        console.error('Error loading contacts:', error);
    });
}

// Open add contact modal
function openAddContactModal() {
    searchedUser = null; // Reset searched user state
    document.getElementById('addContactModal').classList.remove('hidden');
    document.getElementById('contactSearchEmail').value = '';
    document.getElementById('contactSearchResult').classList.add('hidden');
    document.getElementById('contactSearchError').classList.add('hidden');
    
    // Reset button state
    const btn = document.getElementById('addContactBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Add to Contacts';
    }
}

// Close add contact modal
function closeAddContactModal() {
    document.getElementById('addContactModal').classList.add('hidden');
    searchedUser = null;
}

// Search for a user by email or name
async function searchContact() {
    const searchQuery = document.getElementById('contactSearchEmail').value.trim().toLowerCase();
    
    if (!searchQuery) {
        showContactError('Please enter an email address or name');
        return;
    }
    
    try {
        // Search through all users
        const usersSnapshot = await database.ref('users').once('value');
        const users = usersSnapshot.val() || {};
        
        let foundUser = null;
        let foundUserId = null;
        
        // Check if query looks like an email
        const isEmailSearch = searchQuery.includes('@');
        
        if (isEmailSearch) {
            // Basic email validation
            if (!searchQuery.includes('.')) {
                showContactError('Please enter a valid email address');
                return;
            }
            
            // Check if searching for own email
            if (searchQuery === currentUser.email.toLowerCase()) {
                showContactError('You cannot add yourself as a contact');
                return;
            }
            
            // Search by email
            for (let userId in users) {
                if (users[userId].email && users[userId].email.toLowerCase() === searchQuery) {
                    foundUser = users[userId];
                    foundUserId = userId;
                    break;
                }
            }
        } else {
            // Search by name
            for (let userId in users) {
                if (users[userId].name && users[userId].name.toLowerCase().includes(searchQuery)) {
                    // Check if it's not the current user
                    if (userId !== currentUser.uid) {
                        foundUser = users[userId];
                        foundUserId = userId;
                        break;
                    }
                }
            }
        }
        
        if (foundUser) {
            searchedUser = { id: foundUserId, ...foundUser };
            displaySearchResult(foundUser);
        } else {
            showContactError(`No user found with this ${isEmailSearch ? 'email' : 'name'}`);
        }
    } catch (error) {
        console.error('Error searching contact:', error);
        showContactError('Failed to search. Please try again.');
    }
}

// Display search result
async function displaySearchResult(user) {
    document.getElementById('contactSearchError').classList.add('hidden');
    document.getElementById('contactSearchResult').classList.remove('hidden');
    
    document.getElementById('searchResultAvatar').src = user.avatar;
    document.getElementById('searchResultName').textContent = user.name;
    document.getElementById('searchResultEmail').textContent = user.email;
    
    // Reset button to default state first
    const btn = document.getElementById('addContactBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Add to Contacts';
    
    // Check if already in contacts from Firebase (to avoid stale cache)
    try {
        const contactSnapshot = await database.ref('contacts/' + currentUser.uid + '/' + searchedUser.id).once('value');
        const isAlreadyAdded = contactSnapshot.exists();
        
        if (isAlreadyAdded) {
            document.getElementById('addContactBtn').classList.add('hidden');
            document.getElementById('contactAddedMsg').classList.remove('hidden');
        } else {
            document.getElementById('addContactBtn').classList.remove('hidden');
            document.getElementById('contactAddedMsg').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error checking contact status:', error);
        // Default to showing add button if there's an error
        document.getElementById('addContactBtn').classList.remove('hidden');
        document.getElementById('contactAddedMsg').classList.add('hidden');
    }
}

// Show error message in contact search
function showContactError(message) {
    document.getElementById('contactSearchResult').classList.add('hidden');
    document.getElementById('contactSearchError').classList.remove('hidden');
    document.getElementById('contactSearchErrorMsg').textContent = message;
}

// Add contact to user's contact list
async function addContact() {
    if (!searchedUser) return;
    
    try {
        const btn = document.getElementById('addContactBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
        
        // Store name and ID before clearing searchedUser
        const contactName = searchedUser.name;
        const contactId = searchedUser.id;
        
        // Add to contacts in Firebase
        await database.ref('contacts/' + currentUser.uid + '/' + searchedUser.id).set({
            name: searchedUser.name,
            email: searchedUser.email,
            avatar: searchedUser.avatar,
            addedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update local cache immediately
        userContacts[contactId] = {
            name: searchedUser.name,
            email: searchedUser.email,
            avatar: searchedUser.avatar
        };
        
        // Close modal (this will clear searchedUser)
        closeAddContactModal();
        
        // Show success modal using stored name
        showSuccessModal(`${contactName} successfully added to contacts!`);
        
        // Reload contacts immediately to reflect changes
        loadContacts();
        
    } catch (error) {
        console.error('Error adding contact:', error);
        showSuccessModal('Failed to add contact. Please try again.');
        const btn = document.getElementById('addContactBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Add to Contacts';
        }
    }
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
        
        // Load blocked contacts
        loadBlockedContacts();
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
        showSuccessModal('Image size should be less than 5MB');
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
            
            showSuccessModal('Profile picture updated successfully!');
        } catch (error) {
            showSuccessModal('Failed to upload: ' + error.message);
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
        
        // Reset button
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        // Show success modal
        showSuccessModal('Settings saved successfully!');
        
    } catch (error) {
        showSuccessModal('Failed to save settings: ' + error.message);
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
                    showSuccessModal('Notifications enabled!');
                } else {
                    document.getElementById('notificationsToggle').checked = false;
                    showSuccessModal('Please allow notifications in your browser settings');
                }
            });
        } else {
            document.getElementById('notificationsToggle').checked = false;
            showSuccessModal('Notifications are not supported in this browser');
        }
    } else {
        localStorage.setItem('notificationsEnabled', 'false');
        showSuccessModal('Notifications disabled');
    }
}

// Load blocked contacts
async function loadBlockedContacts() {
    const blockedList = document.getElementById('blockedContactsList');
    
    try {
        const snapshot = await database.ref('blocked/' + currentUser.uid).once('value');
        const blocked = snapshot.val() || {};
        
        if (Object.keys(blocked).length === 0) {
            blockedList.innerHTML = '<p class="text-sm text-gray-500">No blocked contacts</p>';
            return;
        }
        
        blockedList.innerHTML = '';
        
        Object.keys(blocked).forEach(userId => {
            const contact = blocked[userId];
            const blockedItem = document.createElement('div');
            blockedItem.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
            
            blockedItem.innerHTML = `
                <div class="flex items-center space-x-3 flex-1 min-w-0">
                    <img src="${contact.avatar}" alt="${contact.name}" class="w-10 h-10 rounded-full">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold truncate">${contact.name}</p>
                        <p class="text-xs text-gray-500 truncate">${contact.email}</p>
                    </div>
                </div>
                <button onclick="unblockContact('${userId}')" class="text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded">
                    Unblock
                </button>
            `;
            
            blockedList.appendChild(blockedItem);
        });
    } catch (error) {
        console.error('Error loading blocked contacts:', error);
        blockedList.innerHTML = '<p class="text-sm text-red-500">Failed to load blocked contacts</p>';
    }
}

// Unblock contact
async function unblockContact(userId) {
    try {
        const snapshot = await database.ref('blocked/' + currentUser.uid + '/' + userId).once('value');
        const blocked = snapshot.val();
        
        if (!blocked) {
            showSuccessModal('Contact not found in blocked list');
            return;
        }
        
        showConfirmModal(
            `Unblock ${blocked.name}?`,
            '',
            async () => {
                try {
                    // Remove from blocked list
                    await database.ref('blocked/' + currentUser.uid + '/' + userId).remove();
                    
                    // Reload blocked contacts list
                    loadBlockedContacts();
                    
                    showSuccessModal(`${blocked.name} has been unblocked. You can add them as a contact again if you wish.`);
                    
                    // Auto-dismiss after 2 seconds
                    setTimeout(() => {
                        document.getElementById('successModal').classList.add('hidden');
                    }, 2000);
                } catch (error) {
                    console.error('Error unblocking contact:', error);
                    showSuccessModal('Failed to unblock contact: ' + error.message);
                }
            }
        );
    } catch (error) {
        console.error('Error unblocking contact:', error);
        showSuccessModal('Failed to unblock contact: ' + error.message);
    }
}

// Delete account
async function deleteAccount() {
    showInputModal(
        'Delete Account',
        'This will permanently delete your account and all data. Type DELETE to confirm:',
        'DELETE',
        async (confirmation) => {
            if (confirmation !== 'DELETE') {
                showSuccessModal('Account deletion cancelled');
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
                
                showSuccessModal('Account deleted successfully');
                closeSettings();
            } catch (error) {
                showSuccessModal('Failed to delete account: ' + error.message + '. You may need to re-login and try again.');
            }
        }
    );
}

// Add event listener for about character count
document.addEventListener('DOMContentLoaded', function() {
    const aboutInput = document.getElementById('settingsAbout');
    if (aboutInput) {
        aboutInput.addEventListener('input', updateAboutCharCount);
    }
});

// ============================================
// VIDEO FEED FUNCTIONALITY
// ============================================

// Show chats view
function showChatsView() {
    // Update tabs
    document.getElementById('chatsTab').className = 'flex-1 py-3 px-4 text-center font-semibold border-b-2 border-green-500 text-green-600 transition';
    document.getElementById('videosTab').className = 'flex-1 py-3 px-4 text-center font-semibold border-b-2 border-transparent text-gray-600 hover:bg-gray-50 transition';
    
    // Show chat window, hide videos view
    const chatWindow = document.getElementById('chatWindow');
    const videosView = document.getElementById('videosView');
    const chatSidebar = document.getElementById('chatSidebar');
    
    // Ensure chat pane visible and videos hidden
    videosView.style.display = 'none';
    videosView.style.flex = '0';
    videosView.classList.add('hidden');
    
    if (window.innerWidth < 768) {
        // Mobile: show only sidebar (chat list) and hide chat pane
        chatSidebar.classList.remove('hidden-mobile');
        chatSidebar.style.display = 'flex';
        chatWindow.classList.add('hidden-mobile');
        chatWindow.classList.add('hidden');
        chatWindow.style.display = 'none';
        chatWindow.style.flex = '0';
    } else {
        // Desktop: show sidebar and chat pane
        chatSidebar.classList.remove('hidden-mobile');
        chatSidebar.style.display = 'flex';
        chatWindow.classList.remove('hidden-mobile');
        chatWindow.classList.remove('hidden');
        chatWindow.style.display = 'flex';
        chatWindow.style.flex = '1';
    }
}

// Show videos view
function showVideosView() {
    // Update tabs
    document.getElementById('chatsTab').className = 'flex-1 py-3 px-4 text-center font-semibold border-b-2 border-transparent text-gray-600 hover:bg-gray-50 transition';
    document.getElementById('videosTab').className = 'flex-1 py-3 px-4 text-center font-semibold border-b-2 border-green-500 text-green-600 transition';
    
    // Hide chat window, show videos view
    const chatWindow = document.getElementById('chatWindow');
    const videosView = document.getElementById('videosView');
    const chatSidebar = document.getElementById('chatSidebar');
    
    // Hide chat completely
    chatWindow.classList.add('hidden-mobile');
    chatWindow.classList.add('hidden');
    chatWindow.style.display = 'none';
    chatWindow.style.flex = '0';
    
    // Show videos on the right
    videosView.classList.remove('hidden');
    videosView.style.display = 'flex';
    videosView.style.flex = '1';
    
    // On mobile, hide sidebar; on desktop, keep it visible
    if (window.innerWidth < 768) {
        chatSidebar.style.display = 'none';
    } else {
        chatSidebar.style.display = 'flex';
    }
    
    // Load videos
    loadVideosFeed();
}

// Open upload video modal
function openUploadVideoModal() {
    document.getElementById('uploadVideoModal').classList.remove('hidden');
    document.getElementById('videoTitle').value = '';
    document.getElementById('videoDescription').value = '';
    document.getElementById('videoFileInput').value = '';
}

// Close upload video modal
function closeUploadVideoModal() {
    document.getElementById('uploadVideoModal').classList.add('hidden');
}

// Upload video to feed
async function uploadVideoToFeed() {
    const title = document.getElementById('videoTitle').value.trim();
    const description = document.getElementById('videoDescription').value.trim();
    const fileInput = document.getElementById('videoFileInput');
    const file = fileInput.files[0];
    
    if (!title) {
        showSuccessModal('Please enter a video title');
        return;
    }
    
    if (!file) {
        showSuccessModal('Please select a video file');
        return;
    }
    
    // Check file size (100 MB limit)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
        showSuccessModal('Video is too large! Maximum size is 100 MB.');
        return;
    }
    
    // Check if it's a video
    if (!file.type.startsWith('video/')) {
        showSuccessModal('Please select a valid video file');
        return;
    }
    
    showSuccessModal('Uploading video... Please wait.');
    closeUploadVideoModal();
    
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const videoData = e.target.result;
            
            // Upload to Firebase
            await database.ref('videos').push({
                title: title,
                description: description,
                videoData: videoData,
                fileName: file.name,
                fileType: file.type,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                userAvatar: allUsers[currentUser.uid]?.avatar || currentUser.photoURL,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                likes: 0,
                views: 0
            });
            
            showSuccessModal('Video uploaded successfully!');
            loadVideosFeed();
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error uploading video:', error);
        showSuccessModal('Failed to upload video: ' + error.message);
    }
}

// Load videos feed
function loadVideosFeed() {
    const feedContainer = document.getElementById('videosFeed');
    
    database.ref('videos').orderByChild('timestamp').once('value', snapshot => {
        const videos = [];
        snapshot.forEach(childSnapshot => {
            videos.unshift({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        
        if (videos.length === 0) {
            feedContainer.innerHTML = `
                <div class="flex items-center justify-center h-full text-gray-400">
                    <div class="text-center">
                        <i class="fas fa-video text-6xl mb-4"></i>
                        <p class="text-lg">No videos yet</p>
                        <button onclick="openUploadVideoModal()" class="mt-4 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg">
                            <i class="fas fa-plus mr-2"></i>Upload First Video
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        feedContainer.innerHTML = '';
        
        videos.forEach(video => {
            const videoCard = createVideoCard(video);
            feedContainer.appendChild(videoCard);
        });
    });
}

// Create video card
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.id = 'video-card-' + video.id;
    
    const isOwner = video.userId === currentUser.uid;
    
    // Check if current user has liked
    const userHasLiked = video.likes && video.likes[currentUser.uid] === true;
    const likeCount = video.likes ? Object.keys(video.likes).length : 0;
    
    // Get comment count
    const commentCount = video.comments ? Object.keys(video.comments).length : 0;
    
    const menuButton = isOwner ? `
        <div class="absolute top-3 right-3 z-20">
            <button onclick="toggleVideoMenu('${video.id}')" class="bg-gray-900 bg-opacity-70 hover:bg-opacity-90 text-white rounded-full w-10 h-10 flex items-center justify-center transition shadow-lg">
                <i class="fas fa-ellipsis-vertical"></i>
            </button>
            <div id="video-menu-${video.id}" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-30">
                <button onclick="openEditVideo('${video.id}')" class="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 flex items-center space-x-3 rounded-t-lg">
                    <i class="fas fa-edit"></i>
                    <span>Edit Video</span>
                </button>
                <button onclick="deleteVideo('${video.id}')" class="w-full text-left px-4 py-3 hover:bg-gray-100 text-red-600 flex items-center space-x-3 rounded-b-lg">
                    <i class="fas fa-trash"></i>
                    <span>Delete Video</span>
                </button>
            </div>
        </div>
    ` : '';
    
    card.innerHTML = `
        <!-- Video Wrapper -->
        <div class="video-card-wrapper">
            ${menuButton}
            
            <!-- Play button overlay -->
            <button id="play-btn-${video.id}" onclick="toggleVideoPlay('${video.id}')" class="absolute inset-0 flex items-center justify-center z-10 bg-black bg-opacity-20 transition hover:bg-opacity-30">
                <div class="bg-white bg-opacity-95 hover:bg-opacity-100 rounded-full p-5 shadow-2xl transition transform hover:scale-110">
                    <i class="fas fa-play text-4xl text-green-600"></i>
                </div>
            </button>
            
            <video id="video-${video.id}" playsinline>
                <source src="${video.videoData}" type="${video.fileType}">
            </video>
        </div>
        
        <!-- Video Information -->
        <div class="video-card-info">
            <div class="flex items-center space-x-3 mb-3">
                <img src="${video.userAvatar}" alt="${video.userName}" class="w-10 h-10 rounded-full border-2 border-gray-600">
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-white text-sm truncate">${video.userName}</p>
                    <p class="text-xs text-gray-400">${formatVideoTime(video.timestamp)}</p>
                </div>
                <div class="flex items-center space-x-1 text-gray-400">
                    <i class="fas fa-eye text-sm"></i>
                    <span class="text-xs font-semibold">${video.views || 0}</span>
                </div>
            </div>
            
            <h3 class="font-bold text-white text-base mb-2 line-clamp-2">${escapeHtml(video.title)}</h3>
            ${video.description ? `<p class="text-sm text-gray-300 line-clamp-3 leading-relaxed">${escapeHtml(video.description)}</p>` : ''}
        </div>
        
        <!-- Action Buttons -->
        <div class="video-card-actions">
            <!-- Like button -->
            <button onclick="toggleLike('${video.id}')" class="flex flex-col items-center space-y-1 transition transform hover:scale-110 active:scale-95">
                <div class="flex items-center justify-center">
                    <i id="like-icon-${video.id}" class="fas fa-heart text-2xl ${userHasLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}"></i>
                </div>
                <span id="like-count-${video.id}" class="text-white text-xs font-semibold">${likeCount}</span>
            </button>
            
            <!-- Comment button -->
            <button onclick="openComments('${video.id}')" class="flex flex-col items-center space-y-1 transition transform hover:scale-110 active:scale-95">
                <div class="flex items-center justify-center">
                    <i class="fas fa-comment text-2xl text-gray-400 hover:text-blue-400"></i>
                </div>
                <span id="comment-count-${video.id}" class="text-white text-xs font-semibold">${commentCount}</span>
            </button>
            
            <!-- Share button -->
            <button onclick="shareVideo('${video.id}')" class="flex flex-col items-center space-y-1 transition transform hover:scale-110 active:scale-95">
                <div class="flex items-center justify-center">
                    <i class="fas fa-share text-2xl text-gray-400 hover:text-green-400"></i>
                </div>
                <span class="text-white text-xs font-semibold">Share</span>
            </button>
        </div>
    `;
    
    // Add video event listeners after card is created
    setTimeout(() => {
        const videoElement = document.getElementById('video-' + video.id);
        const playButton = document.getElementById('play-btn-' + video.id);
        
        if (videoElement) {
            videoElement.addEventListener('play', () => {
                if (playButton) playButton.classList.add('hidden');
                incrementVideoView(video.id);
            });
            
            videoElement.addEventListener('pause', () => {
                if (playButton) playButton.classList.remove('hidden');
            });
            
            videoElement.addEventListener('ended', () => {
                if (playButton) playButton.classList.remove('hidden');
            });
            
            // Click on video to pause/play
            videoElement.addEventListener('click', () => {
                toggleVideoPlay(video.id);
            });
        }
    }, 100);
    
    return card;
}

// Format video timestamp
function formatVideoTime(timestamp) {
    if (!timestamp) return 'Just now';
    
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
    if (hours > 0) return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
    if (minutes > 0) return minutes + ' min' + (minutes > 1 ? 's' : '') + ' ago';
    return 'Just now';
}

// Toggle video play/pause
function toggleVideoPlay(videoId) {
    const video = document.getElementById('video-' + videoId);
    const playBtn = document.getElementById('play-btn-' + videoId);
    
    if (video.paused) {
        video.play();
        playBtn.classList.add('hidden');
    } else {
        video.pause();
        playBtn.classList.remove('hidden');
    }
}

// Toggle video menu
function toggleVideoMenu(videoId) {
    const menu = document.getElementById('video-menu-' + videoId);
    
    // Close all other menus
    document.querySelectorAll('[id^="video-menu-"]').forEach(m => {
        if (m.id !== 'video-menu-' + videoId) {
            m.classList.add('hidden');
        }
    });
    
    menu.classList.toggle('hidden');
}

// Close video menus when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('button[onclick*="toggleVideoMenu"]')) {
        document.querySelectorAll('[id^="video-menu-"]').forEach(menu => {
            if (!menu.contains(event.target)) {
                menu.classList.add('hidden');
            }
        });
    }
});

// Toggle like/unlike
let currentVideoId = null;

async function toggleLike(videoId) {
    try {
        const likesRef = database.ref('videos/' + videoId + '/likes/' + currentUser.uid);
        const snapshot = await likesRef.once('value');
        const hasLiked = snapshot.exists();
        
        const likeIcon = document.getElementById('like-icon-' + videoId);
        const likeCount = document.getElementById('like-count-' + videoId);
        
        if (hasLiked) {
            // Unlike
            await likesRef.remove();
            likeIcon.classList.remove('text-red-500');
            likeIcon.classList.add('text-white');
        } else {
            // Like
            await likesRef.set(true);
            likeIcon.classList.remove('text-white');
            likeIcon.classList.add('text-red-500');
        }
        
        // Update count
        const allLikes = await database.ref('videos/' + videoId + '/likes').once('value');
        const count = allLikes.exists() ? Object.keys(allLikes.val()).length : 0;
        likeCount.textContent = count;
        
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

// Increment video view
async function incrementVideoView(videoId) {
    try {
        const videoRef = database.ref('videos/' + videoId);
        const snapshot = await videoRef.once('value');
        const video = snapshot.val();
        
        const currentViews = video.views || 0;
        await videoRef.update({
            views: currentViews + 1
        });
    } catch (error) {
        console.error('Error incrementing view:', error);
    }
}

// Open edit video modal
function openEditVideo(videoId) {
    currentVideoId = videoId;
    toggleVideoMenu(videoId);
    
    database.ref('videos/' + videoId).once('value', snapshot => {
        const video = snapshot.val();
        document.getElementById('editVideoTitle').value = video.title;
        document.getElementById('editVideoDescription').value = video.description || '';
        document.getElementById('editVideoModal').classList.remove('hidden');
    });
}

// Close edit video modal
function closeEditVideoModal() {
    document.getElementById('editVideoModal').classList.add('hidden');
    currentVideoId = null;
}

// Save video edit
async function saveVideoEdit() {
    if (!currentVideoId) return;
    
    const title = document.getElementById('editVideoTitle').value.trim();
    const description = document.getElementById('editVideoDescription').value.trim();
    
    if (!title) {
        showSuccessModal('Please enter a video title');
        return;
    }
    
    try {
        await database.ref('videos/' + currentVideoId).update({
            title: title,
            description: description
        });
        
        showSuccessModal('Video updated successfully!');
        closeEditVideoModal();
        loadVideosFeed();
    } catch (error) {
        console.error('Error updating video:', error);
        showSuccessModal('Failed to update video: ' + error.message);
    }
}

// Open comments modal
function openComments(videoId) {
    currentVideoId = videoId;
    document.getElementById('commentsModal').classList.remove('hidden');
    loadComments(videoId);
}

// Close comments modal
function closeCommentsModal() {
    document.getElementById('commentsModal').classList.add('hidden');
    currentVideoId = null;
}

// Load comments
function loadComments(videoId) {
    const commentsList = document.getElementById('commentsList');
    
    database.ref('videos/' + videoId + '/comments').on('value', snapshot => {
        const comments = [];
        snapshot.forEach(childSnapshot => {
            comments.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });
        
        if (comments.length === 0) {
            commentsList.innerHTML = '<p class="text-gray-500 text-center py-8">No comments yet. Be the first to comment!</p>';
            return;
        }
        
        commentsList.innerHTML = '';
        
        comments.forEach(comment => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'flex space-x-3 mb-4 group';
            
            const deleteBtn = comment.userId === currentUser.uid ? `
                <button onclick="deleteComment('${videoId}', '${comment.id}')" class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition">
                    <i class="fas fa-trash text-sm"></i>
                </button>
            ` : '';
            
            commentDiv.innerHTML = `
                <img src="${comment.userAvatar}" alt="${comment.userName}" class="w-8 h-8 rounded-full">
                <div class="flex-1">
                    <div class="bg-gray-100 rounded-lg px-3 py-2">
                        <p class="font-semibold text-sm">${comment.userName}</p>
                        <p class="text-sm text-gray-800">${escapeHtml(comment.text)}</p>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">${formatVideoTime(comment.timestamp)}</p>
                </div>
                ${deleteBtn}
            `;
            
            commentsList.appendChild(commentDiv);
        });
        
        // Update comment count in video card
        const commentCountElement = document.getElementById('comment-count-' + videoId);
        if (commentCountElement) {
            commentCountElement.textContent = comments.length;
        }
    });
}

// Add comment
async function addComment() {
    if (!currentVideoId) return;
    
    const commentInput = document.getElementById('commentInput');
    const text = commentInput.value.trim();
    
    if (!text) return;
    
    try {
        await database.ref('videos/' + currentVideoId + '/comments').push({
            text: text,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            userAvatar: allUsers[currentUser.uid]?.avatar || currentUser.photoURL,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        commentInput.value = '';
    } catch (error) {
        console.error('Error adding comment:', error);
        showSuccessModal('Failed to add comment: ' + error.message);
    }
}

// Delete comment
async function deleteComment(videoId, commentId) {
    showConfirmModal(
        'Delete Comment',
        'Are you sure you want to delete this comment?',
        async () => {
            try {
                await database.ref('videos/' + videoId + '/comments/' + commentId).remove();
            } catch (error) {
                console.error('Error deleting comment:', error);
                showSuccessModal('Failed to delete comment: ' + error.message);
            }
        }
    );
}

// Share video
function shareVideo(videoId) {
    const shareData = {
        title: 'Check out this video!',
        text: 'Watch this amazing video on our app',
        url: window.location.href
    };
    
    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        // Fallback: copy link
        navigator.clipboard.writeText(window.location.href);
        showSuccessModal('Link copied to clipboard!');
    }
}

// Delete video
async function deleteVideo(videoId) {
    showConfirmModal(
        'Delete Video',
        'Are you sure you want to delete this video? This cannot be undone.',
        async () => {
            try {
                await database.ref('videos/' + videoId).remove();
                showSuccessModal('Video deleted successfully');
                loadVideosFeed();
            } catch (error) {
                console.error('Error deleting video:', error);
                showSuccessModal('Failed to delete video: ' + error.message);
            }
        }
    );
}
