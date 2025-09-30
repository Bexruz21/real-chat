const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            // Состояния приложения
            status: 'disconnected',
            message: '',
            messages: [],
            partnerId: null,
            roomId: null,
            connection: null,

            // Telegram Web App данные
            telegram: null,
            userTelegramId: null,

            // Статистика
            searchTime: 0,
            searchInterval: null,

            // WebSocket
            wsUrl: 'wss://cb86adb831e4.ngrok-free.app',
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

    mounted() {
        this.initTelegramWebApp();
    },

    methods: {
        // В initTelegramWebApp добавьте больше отладки:
        initTelegramWebApp() {
            this.telegram = window.Telegram?.WebApp;

            console.log('🔧 Инициализация Telegram Web App...');

            if (this.telegram) {
                this.telegram.ready();
                this.telegram.expand();

                // Пробуем получить данные из Telegram Web App
                const user = this.telegram.initDataUnsafe?.user;
                console.log('📋 Данные пользователя из Telegram:', user);

                if (user && user.id) {
                    this.userTelegramId = user.id.toString(); // Преобразуем в строку
                    console.log('✅ Telegram User ID из WebApp:', this.userTelegramId);
                    this.addSystemMessage(`Добро пожаловать! Ваш ID: ${this.userTelegramId}`);
                } else {
                    // Если нет данных из WebApp, пробуем получить из URL параметров
                    this.userTelegramId = this.getUserIdFromUrl();
                    if (this.userTelegramId) {
                        console.log('✅ Telegram User ID из URL:', this.userTelegramId);
                        this.addSystemMessage(`Добро пожаловать! Ваш ID: ${this.userTelegramId}`);
                    } else {
                        // Режим тестирования
                        this.userTelegramId = 'test_' + Math.random().toString(36).substr(2, 9);
                        console.log('⚠️ Тестовый User ID:', this.userTelegramId);
                        this.addSystemMessage('Режим тестирования (без Telegram)');
                    }
                }
            } else {
                // Режим без Telegram Web App
                this.userTelegramId = this.getUserIdFromUrl() || 'dev_' + Math.random().toString(36).substr(2, 9);
                console.log('🔧 User ID:', this.userTelegramId);
                this.addSystemMessage(this.userTelegramId.startsWith('dev_') ? 'Режим разработки' : 'Добро пожаловать!');
            }

            console.log('🎯 Финальный User ID:', this.userTelegramId);
        },

        // Добавьте метод для получения ID из URL
        getUserIdFromUrl() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('tg_user_id');
        },

        // Инициализация WebSocket
        initWebSocket() {
            try {
                console.log('🔄 Подключение к WebSocket...');
                this.connection = new WebSocket(this.wsUrl);

                this.connection.onopen = () => {
                    console.log('✅ WebSocket соединение установлено');
                    this.addSystemMessage('Подключено к серверу');

                    // ОТПРАВЛЯЕМ ЗАПРОС НА ПОИСК ПОСЛЕ ПОДКЛЮЧЕНИЯ
                    console.log('🔍 Отправка запроса на поиск, TG ID:', this.userTelegramId);
                    this.sendWebSocketMessage({
                        type: 'find_partner',
                        telegramId: this.userTelegramId  // Убедитесь что этот параметр передается
                    });
                };

                this.connection.onmessage = (event) => {
                    console.log('📩 Получено сообщение:', event.data);
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                };

                this.connection.onclose = () => {
                    console.log('🔒 WebSocket соединение закрыто');
                    if (this.status !== 'disconnected') {
                        this.disconnect();
                    }
                };

                this.connection.onerror = (error) => {
                    console.error('❌ WebSocket ошибка:', error);
                    this.addSystemMessage('Ошибка подключения');
                    this.disconnect();
                };

            } catch (error) {
                console.error('❌ Ошибка инициализации WebSocket:', error);
                this.addSystemMessage('Ошибка подключения к серверу');
            }
        },

        // Обработка сообщений WebSocket
        handleWebSocketMessage(data) {
            switch (data.type) {
                case 'partner_found':
                    this.status = 'connected';
                    this.partnerId = data.partnerId;
                    this.roomId = data.roomId;
                    this.stopSearchTimer();
                    this.addSystemMessage(`Собеседник найден! ID: ${data.partnerId}`);
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

                case 'searching':
                    this.addSystemMessage(data.message);
                    break;

                case 'search_timeout':
                    this.addSystemMessage(data.message);
                    this.disconnect();
                    break;

                case 'error':
                    this.addSystemMessage(data.message);
                    break;
            }
        },

        // Отправка сообщения WebSocket
        sendWebSocketMessage(message) {
            console.log('📤 Отправка сообщения:', message);
            if (this.connection && this.connection.readyState === WebSocket.OPEN) {
                this.connection.send(JSON.stringify(message));
            } else {
                console.log('❌ WebSocket не подключен, сообщение не отправлено:', message);
            }
        },

        // Начать поиск собеседника
        startSearch() {
            if (!this.userTelegramId) {
                this.addSystemMessage('Ошибка: не получен Telegram ID');
                return;
            }

            this.status = 'searching';
            this.messages = [];
            this.partnerId = null;
            this.roomId = null;
            this.searchTime = 0;

            this.initWebSocket();

            // Запуск таймера поиска
            this.searchInterval = setInterval(() => {
                this.searchTime++;
            }, 1000);

            // Отправка запроса на поиск собеседника - ЖДЕМ подключения WebSocket
        },

        // Остановить поиск
        stopSearch() {
            if (this.userTelegramId) {
                this.sendWebSocketMessage({
                    type: 'stop_search'
                });
            }
            this.status = 'disconnected';
            this.stopSearchTimer();

            if (this.connection) {
                this.connection.close();
            }
        },

        // Отключиться
        disconnect() {
            if (this.userTelegramId) {
                this.sendWebSocketMessage({
                    type: 'disconnect'
                });
            }
            this.status = 'disconnected';
            this.stopSearchTimer();
            this.partnerId = null;
            this.roomId = null;

            if (this.connection) {
                this.connection.close();
                this.connection = null;
            }
        },

        // Следующий собеседник
        nextPartner() {
            this.disconnect();
            setTimeout(() => {
                this.startSearch();
            }, 1000);
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
                telegramId: this.userTelegramId
            });

            this.message = '';
            this.autoResize();
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

        // Обработка нажатия клавиш
        handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
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

        // Форматирование времени
        formatTime(timestamp) {
            return new Date(timestamp).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
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
                    <div class="user-id" v-if="userTelegramId">Ваш ID: {{ userTelegramId }}</div>
                </div>
                
                <div v-else-if="isSearching" class="searching-state">
                    <div class="searching-animation">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                    <div class="searching-text">Ищем собеседника...</div>
                    <div class="user-id" v-if="userTelegramId">Ваш ID: {{ userTelegramId }}</div>
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
    `
});

app.mount('#app');