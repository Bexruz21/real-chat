const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            // Состояния приложения
            status: 'disconnected', // disconnected, searching, connected
            message: '',
            messages: [],
            partnerId: null,
            connection: null,

            // Статистика
            searchTime: 0,
            searchInterval: null,

            // Настройки WebSocket
            wsUrl: 'wss://be7f55e6f41c.ngrok-free.app',
        };
    },

    computed: {
        statusText() {
            const statusMap = {
                'disconnected': 'Отключен',
                'searching': 'Поиск собеседника...',
                'connected': 'Соединение установлено'
            };
            return statusMap[this.status];
        },

        isSearching() {
            return this.status === 'searching';
        },

        isConnected() {
            return this.status === 'connected';
        },

        formattedSearchTime() {
            const minutes = Math.floor(this.searchTime / 60);
            const seconds = this.searchTime % 60;
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    },

    methods: {
        // Инициализация WebSocket соединения
        initWebSocket() {
            try {
                this.connection = new WebSocket(this.wsUrl);

                this.connection.onopen = () => {
                    console.log('WebSocket соединение установлено');
                };

                this.connection.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                };

                this.connection.onclose = () => {
                    console.log('WebSocket соединение закрыто');
                    if (this.status !== 'disconnected') {
                        this.disconnect();
                    }
                };

                this.connection.onerror = (error) => {
                    console.error('WebSocket ошибка:', error);
                    this.disconnect();
                };

            } catch (error) {
                console.error('Ошибка инициализации WebSocket:', error);
            }
        },

        // Обработка входящих сообщений от WebSocket сервера
        handleWebSocketMessage(data) {
            switch (data.type) {
                case 'partner_found':
                    this.status = 'connected';
                    this.partnerId = data.partnerId;
                    this.stopSearchTimer();
                    this.addSystemMessage('Собеседник найден! Начинайте общение.');
                    break;

                case 'partner_disconnected':
                    this.addSystemMessage('Собеседник покинул чат');
                    this.startSearch();
                    break;

                case 'message':
                    this.addMessage({
                        id: Date.now(),
                        text: data.message,
                        isOwn: false,
                        timestamp: new Date()
                    });
                    break;

                case 'search_timeout':
                    this.addSystemMessage('Не удалось найти собеседника. Попробуйте снова.');
                    this.disconnect();
                    break;
            }
        },

        // Отправка сообщения на сервер
        sendWebSocketMessage(message) {
            if (this.connection && this.connection.readyState === WebSocket.OPEN) {
                this.connection.send(JSON.stringify(message));
            }
        },

        // Начать поиск собеседника
        startSearch() {
            this.status = 'searching';
            this.messages = [];
            this.partnerId = null;
            this.searchTime = 0;

            this.initWebSocket();

            // Запуск таймера поиска
            this.searchInterval = setInterval(() => {
                this.searchTime++;
            }, 1000);

            // Отправка запроса на поиск собеседника
            setTimeout(() => {
                if (this.connection && this.connection.readyState === WebSocket.OPEN) {
                    this.sendWebSocketMessage({
                        type: 'find_partner',
                        userId: this.generateUserId()
                    });
                }
            }, 1000);
        },

        // Остановить поиск
        stopSearch() {
            this.status = 'disconnected';
            this.stopSearchTimer();

            if (this.connection) {
                this.sendWebSocketMessage({
                    type: 'stop_search'
                });
                this.connection.close();
            }
        },

        // Отключиться от текущего собеседника
        // В app.js добавьте в метод disconnect
        disconnect() {
            console.log('🔌 Отключение от чата');
            this.status = 'disconnected';
            this.stopSearchTimer();

            if (this.connection) {
                this.sendWebSocketMessage({
                    type: 'disconnect'
                });
                this.connection.close();
                this.connection = null;
            }

            this.partnerId = null;
            this.messages = [];
        },

        // Найти следующего собеседника
        nextPartner() {
            this.disconnect();
            setTimeout(() => {
                this.startSearch();
            }, 500);
        },

        // Отправить сообщение
        sendMessage() {
            if (!this.message.trim() || !this.isConnected) return;

            const messageData = {
                id: Date.now(),
                text: this.message.trim(),
                isOwn: true,
                timestamp: new Date()
            };

            this.addMessage(messageData);

            // Отправка сообщения через WebSocket
            this.sendWebSocketMessage({
                type: 'message',
                message: this.message.trim(),
                partnerId: this.partnerId
            });

            this.message = '';
        },

        // Добавить сообщение в историю
        addMessage(message) {
            this.messages.push(message);
            this.scrollToBottom();
        },

        // Добавить системное сообщение
        addSystemMessage(text) {
            this.messages.push({
                id: Date.now(),
                text: text,
                isSystem: true,
                timestamp: new Date()
            });
            this.scrollToBottom();
        },

        // Прокрутка к последнему сообщению
        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.messagesContainer;
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
        },

        // Остановка таймера поиска
        stopSearchTimer() {
            if (this.searchInterval) {
                clearInterval(this.searchInterval);
                this.searchInterval = null;
            }
        },

        // Генерация ID пользователя
        // В app.js замените функцию generateUserId
        generateUserId() {
            // Используем более уникальный идентификатор
            return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        // Форматирование времени сообщения
        formatTime(timestamp) {
            return new Date(timestamp).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        // Обработка нажатия Enter
        handleKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
        },
        handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Предотвращаем перенос строки
                this.sendMessage();
            }
        },

        // Автоматическое изменение высоты textarea
        autoResize() {
            this.$nextTick(() => {
                const textarea = this.$refs.messageInput;
                if (textarea) {
                    textarea.style.height = 'auto';
                    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
                }
            });
        },
    },

    beforeUnmount() {
        this.stopSearchTimer();
        if (this.connection) {
            this.connection.close();
        }
    },

    template: `
    <div class="chat-app" :class="status">
        <!-- Заголовок -->
        <div class="header">
            <div class="status-indicator" :class="status"></div>
            <div class="status-text">{{ statusText }}</div>
            <div v-if="isSearching" class="search-timer">{{ formattedSearchTime }}</div>
        </div>
        
        <!-- Область сообщений -->
        <div class="messages-container" ref="messagesContainer">
            <div v-if="messages.length === 0 && !isSearching" class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-text">Начните поиск собеседника</div>
            </div>
            
            <div v-else-if="isSearching" class="searching-state">
                <div class="searching-animation">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
                <div class="searching-text">Ищем собеседника...</div>
            </div>
            
            <div v-else class="messages">
                <div v-for="message in messages" :key="message.id" 
                     class="message" 
                     :class="{
                         'own': message.isOwn,
                         'system': message.isSystem
                     }">
                    <div v-if="!message.isSystem" class="message-bubble">
                        <div class="message-text">{{ message.text }}</div>
                        <div class="message-time">{{ formatTime(message.timestamp) }}</div>
                    </div>
                    <div v-else class="system-message">
                        {{ message.text }}
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Панель управления -->
        <div class="control-panel">
            <div v-if="!isSearching && !isConnected" class="action-buttons">
                <button @click="startSearch" class="btn btn-primary">
                    Найти собеседника
                </button>
            </div>
            
            <div v-else-if="isSearching" class="action-buttons">
                <button @click="stopSearch" class="btn btn-secondary">
                    Отменить поиск
                </button>
            </div>
            
            <div v-else-if="isConnected" class="chat-controls">
                <div class="message-input-container">
                    <textarea v-model="message" 
                              @keydown="handleKeyDown"
                              @input="autoResize"
                              placeholder="Введите сообщение..."
                              class="message-input"
                              ref="messageInput"
                              rows="1"></textarea>
                    <button @click="sendMessage" 
                            :disabled="!message.trim()"
                            class="send-btn"
                            :class="{ 'active': message.trim() }">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
                <button @click="nextPartner" class="btn btn-next">
                    Следующий собеседник
                </button>
            </div>
        </div>
    </div>
`,
});

// Инициализация приложения
app.mount('#app');