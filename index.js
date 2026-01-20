const express = require('express');
const session = require('express-session');
const passport = require('passport');
const app = express();
const { Sequelize, DataTypes, Op } = require('sequelize');

const db = new Sequelize('library_app', 'postgres', '123', {
    host: 'localhost',
    port: 5432,
    dialect: 'postgres',
});

const Book = db.define('Book', {
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    pages: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    shelfId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    }
});

const ShelfSettings = db.define('ShelfSettings', {
    numberOfShelves: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
    },
    shelfCapacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
    },
    user: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
    }
});

const Shelf = db.define('Shelf', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '',
    },
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
    },
    shelfIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user: {
        type: DataTypes.STRING,
        allowNull: false,
    }
});

const User = db.define('User', {
    username: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

User.hasMany(Book, { foreignKey: 'user', sourceKey: 'username' });
Book.belongsTo(User, { foreignKey: 'user', targetKey: 'username' });

User.hasOne(ShelfSettings, { foreignKey: 'user', sourceKey: 'username' });
ShelfSettings.belongsTo(User, { foreignKey: 'user', targetKey: 'username' });

User.hasMany(Shelf, { foreignKey: 'user', sourceKey: 'username' });
Shelf.belongsTo(User, { foreignKey: 'user', targetKey: 'username' });

Shelf.hasMany(Book, { foreignKey: 'shelfId', sourceKey: 'id' });
Book.belongsTo(Shelf, { foreignKey: 'shelfId', targetKey: 'id' });

db.sync({ alter: true });

db.authenticate()
    .then(() => console.log('Database connected...'))
    .catch(err => console.log('Error: ' + err) )


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.set('trust proxy', 1);


app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));


app.use(passport.initialize());
app.use(passport.session());

var LocalStrategy = require('passport-local');

passport.use(new LocalStrategy(async function verify(username, password, cb) {
    try {
        const user = await User.findOne({ where: { username } });

        if (!user || user.password !== password) {
            return cb(null, false, { message: 'Неверное имя пользователя или пароль' });
        }

        return cb(null, user); 
    } catch (err) {
        return cb(err);
    }
}));

passport.serializeUser(function(user, cb) {
    process.nextTick(function() {
        cb(null, { id: user.username, username: user.username });
    });
});

passport.deserializeUser(function(user, cb) {
    process.nextTick(function() {
        return cb(null, user);
    });
});

function auth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login');
}

app.get('/registry', function(req, res) {
    res.render('registry', { error: null });
});

app.post('/registry', async function(req, res) {
    const { username, password } = req.body;

    try {
        
        const existingUser = await User.findOne({ where: { username } });

        if (existingUser) {
            return res.render('registry', { error: 'Пользователь уже существует' });
        }

        await User.create({ username, password }); 
        res.redirect('/login');
    } catch (err) {
        res.render('registry', { error: 'Ошибка регистрации: ' + err.message });
    }
});


app.get('/login', function(req, res) {
    res.render('login');
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login?error=1',
    failureFlash: false
}));

app.get('/logout', function(req, res) {
    req.logout(function(err) {
        if (err) {
            return res.status(500).json({ error: 'Ошибка при выходе' });
        }
        res.redirect('/login');
    });
});


// Функция для инициализации полок
async function initializeShelves(user, numberOfShelves, defaultCapacity) {
    const existingShelves = await Shelf.findAll({ 
        where: { user: user },
        order: [['shelfIndex', 'ASC']]
    });
    
    // Если полок нет или их количество изменилось, создаем/обновляем
    if (existingShelves.length !== numberOfShelves) {
        // Удаляем лишние полки
        if (existingShelves.length > numberOfShelves) {
            const shelvesToDelete = existingShelves.slice(numberOfShelves);
            for (const shelf of shelvesToDelete) {
                // Перемещаем книги с удаляемых полок
                await Book.update({ shelfId: null }, { where: { shelfId: shelf.id } });
                await shelf.destroy();
            }
        }
        
        // Создаем недостающие полки
        for (let i = existingShelves.length; i < numberOfShelves; i++) {
            await Shelf.create({
                name: `Полка ${i + 1}`,
                capacity: defaultCapacity,
                shelfIndex: i,
                user: user
            });
        }
    }
    
    // Обновляем вместимость 
    for (const shelf of existingShelves) {
        if (shelf.capacity !== defaultCapacity) {
            shelf.capacity = defaultCapacity;
            await shelf.save();
        }
    }
}

// Функция для распределения книг по полкам
async function distributeBooksToShelves(books, user) {
    const shelves = await Shelf.findAll({ 
        where: { user: user },
        order: [['shelfIndex', 'ASC']]
    });
    
    const shelvesData = shelves.map(shelf => ({
        id: shelf.id,
        name: shelf.name,
        capacity: shelf.capacity,
        shelfIndex: shelf.shelfIndex,
        books: [],
        usedPages: 0
    }));
    
   
    for (const book of books) {
        if (book.shelfId) {
            const shelfData = shelvesData.find(s => s.id === book.shelfId);
            if (shelfData) {
                shelfData.books.push(book);
                shelfData.usedPages += book.pages;
            }
        }
    }
    
   
    const unassignedBooks = books.filter(book => !book.shelfId);
    const sortedBooks = [...unassignedBooks].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    
    for (const book of sortedBooks) {
        let placed = false;
        
        for (const shelfData of shelvesData) {
            if (shelfData.usedPages + book.pages <= shelfData.capacity) {
                shelfData.books.push(book);
                shelfData.usedPages += book.pages;
                placed = true;
               
                await Book.update({ shelfId: shelfData.id }, { where: { id: book.id } });
                book.shelfId = shelfData.id;
                break;
            }
        }
        // Если книга не помещается ни на одну полку, добавляем на полку с наименьшим заполнением
        if (!placed && shelvesData.length > 0) {
            let minShelf = shelvesData[0];
            for (const shelfData of shelvesData) {
                if (shelfData.usedPages < minShelf.usedPages) {
                    minShelf = shelfData;
                }
            }
            minShelf.books.push(book);
            minShelf.usedPages += book.pages;
            await Book.update({ shelfId: minShelf.id }, { where: { id: book.id } });
            book.shelfId = minShelf.id;
        }
    }
    
    // Сортируем по shelfIndex перед возвратом
    shelvesData.sort((a, b) => a.shelfIndex - b.shelfIndex);
    
    return shelvesData;
}

app.get('/api/books', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const books = await Book.findAll({ 
            where: { user: user },
            order: [['title', 'ASC']]
        });
        
        // Получаем настройки полок 
        let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
        if (!shelfSettings) {
            // Создаем настройки по умолчанию
            shelfSettings = await ShelfSettings.create({
                user: user,
                numberOfShelves: 5,
                shelfCapacity: 10
            });
        }
        
        // Инициализируем полки, если их нет!!!!
        const existingShelves = await Shelf.findAll({ where: { user: user } });
        if (existingShelves.length === 0) {
            await initializeShelves(user, shelfSettings.numberOfShelves, shelfSettings.shelfCapacity);
        }
        
        // Распределяем книги по полкам
        const shelves = await distributeBooksToShelves(books, user);
        
        res.json({ shelves, shelfSettings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/shelf-settings', auth, async function(req, res) {
    try {
        const user = req.user.username;
        let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
        if (!shelfSettings) {
            shelfSettings = await ShelfSettings.create({
                user: user,
                numberOfShelves: 5,
                shelfCapacity: 10
            });
        }
        res.json({ shelfSettings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/current-user', auth, async function(req, res) {
    res.json({ username: req.user.username });
});

// POST маршрут для добавления книги через форму
app.post('/books', auth, async function(req, res) {
    try {
        const { title, pages, shelfId } = req.body;
        const user = req.user.username;
        
        if (!title || !pages) {
            const books = await Book.findAll({ 
                where: { user: user },
                order: [['title', 'ASC']]
            });
            let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
            if (!shelfSettings) {
                shelfSettings = await ShelfSettings.create({
                    user: user,
                    numberOfShelves: 5,
                    shelfCapacity: 10
                });
            }
            const shelves = await distributeBooksToShelves(books, user);
            
            return res.render('index', {
                currentUser: user,
                shelves: shelves,
                shelfSettings: shelfSettings,
                addBookError: 'Название и количество страниц обязательны',
                formData: req.body,
                showAddShelf: false,
                editingShelfId: null,
                shelfErrors: {}
            });
        }
        
        const pagesNum = parseInt(pages);
        if (isNaN(pagesNum) || pagesNum <= 0) {
            const books = await Book.findAll({ 
                where: { user: user },
                order: [['title', 'ASC']]
            });
            let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
            if (!shelfSettings) {
                shelfSettings = await ShelfSettings.create({
                    user: user,
                    numberOfShelves: 5,
                    shelfCapacity: 10
                });
            }
            const shelves = await distributeBooksToShelves(books, user);
            
            return res.render('index', {
                currentUser: user,
                shelves: shelves,
                shelfSettings: shelfSettings,
                addBookError: 'Количество страниц должно быть положительным числом',
                formData: req.body,
                showAddShelf: false,
                editingShelfId: null,
                shelfErrors: {}
            });
        }
        
        // Проверяем, есть ли полки у пользователя
        const existingShelves = await Shelf.findAll({ where: { user: user } });
        
        let targetShelfId = shelfId || null;
        if (existingShelves.length === 0) {
            const defaultShelf = await Shelf.create({
                name: 'Полка 1',
                capacity: 100,
                shelfIndex: 0,
                user: user
            });
            targetShelfId = defaultShelf.id;
        }
        
        // Если указана полка, проверяем вместимость
        if (targetShelfId) {
            const shelf = await Shelf.findOne({ where: { id: targetShelfId, user: user } });
            if (!shelf) {
                const books = await Book.findAll({ 
                    where: { user: user },
                    order: [['title', 'ASC']]
                });
                let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
                if (!shelfSettings) {
                    shelfSettings = await ShelfSettings.create({
                        user: user,
                        numberOfShelves: 5,
                        shelfCapacity: 10
                    });
                }
                const shelves = await distributeBooksToShelves(books, user);
                
                return res.render('index', {
                    currentUser: user,
                    shelves: shelves,
                    shelfSettings: shelfSettings,
                    addBookError: 'Полка не найдена',
                    formData: req.body,
                    showAddShelf: false,
                    editingShelfId: null,
                    shelfErrors: {}
                });
            }
            
            const booksOnShelf = await Book.findAll({ where: { shelfId: targetShelfId } });
            const usedPages = booksOnShelf.reduce((sum, book) => sum + book.pages, 0);
            
            if (usedPages + pagesNum > shelf.capacity) {
                const books = await Book.findAll({ 
                    where: { user: user },
                    order: [['title', 'ASC']]
                });
                let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
                if (!shelfSettings) {
                    shelfSettings = await ShelfSettings.create({
                        user: user,
                        numberOfShelves: 5,
                        shelfCapacity: 10
                    });
                }
                const shelves = await distributeBooksToShelves(books, user);
                
                return res.render('index', {
                    currentUser: user,
                    shelves: shelves,
                    shelfSettings: shelfSettings,
                    addBookError: 'Книга не помещается на эту полку. Превышена вместимость полки.',
                    formData: req.body,
                    showAddShelf: false,
                    editingShelfId: null,
                    shelfErrors: {}
                });
            }
        } else {
            // Проверяем, помещается ли книга хотя бы на одну полку
            const allShelves = await Shelf.findAll({ where: { user: user } });
            if (allShelves.length > 0) {
                let canFit = false;
                for (const shelf of allShelves) {
                    const booksOnShelf = await Book.findAll({ where: { shelfId: shelf.id } });
                    const usedPages = booksOnShelf.reduce((sum, book) => sum + book.pages, 0);
                    if (usedPages + pagesNum <= shelf.capacity) {
                        canFit = true;
                        break;
                    }
                }
                
                if (!canFit) {
                    const books = await Book.findAll({ 
                        where: { user: user },
                        order: [['title', 'ASC']]
                    });
                    let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
                    if (!shelfSettings) {
                        shelfSettings = await ShelfSettings.create({
                            user: user,
                            numberOfShelves: 5,
                            shelfCapacity: 10
                        });
                    }
                    const shelves = await distributeBooksToShelves(books, user);
                    
                    return res.render('index', {
                        currentUser: user,
                        shelves: shelves,
                        shelfSettings: shelfSettings,
                        addBookError: 'Эта книга не помещается ни на одну из доступных полок. Пожалуйста, создайте новую полку или увеличьте вместимость существующих.',
                        formData: req.body,
                        showAddShelf: false,
                        editingShelfId: null,
                        shelfErrors: {}
                    });
                }
            }
        }
        
        // Создаем книгу
        await Book.create({ title, pages: pagesNum, user, shelfId: targetShelfId });
        
        // Перераспределяем книги
        const books = await Book.findAll({ 
            where: { user: user },
            order: [['title', 'ASC']]
        });
        const shelves = await distributeBooksToShelves(books, user);
        let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
        if (!shelfSettings) {
            shelfSettings = await ShelfSettings.create({
                user: user,
                numberOfShelves: 5,
                shelfCapacity: 10
            });
        }
        
        res.redirect('/');
    } catch (error) {
        const books = await Book.findAll({ 
            where: { user: req.user.username },
            order: [['title', 'ASC']]
        });
        let shelfSettings = await ShelfSettings.findOne({ where: { user: req.user.username } });
        if (!shelfSettings) {
            shelfSettings = await ShelfSettings.create({
                user: req.user.username,
                numberOfShelves: 5,
                shelfCapacity: 10
            });
        }
        const shelves = await distributeBooksToShelves(books, req.user.username);
        
        res.render('index', {
            currentUser: req.user.username,
            shelves: shelves,
            shelfSettings: shelfSettings,
            addBookError: 'Ошибка при добавлении книги: ' + error.message,
            formData: req.body,
            showAddShelf: false,
            editingShelfId: null,
            shelfErrors: {}
        });
    }
});

app.post('/api/books', auth, async function(req, res) {
    try {
        const { title, pages, shelfId } = req.body;
        const user = req.user.username;
        
        if (!title || !pages) {
            return res.status(400).json({ error: 'Title and pages are required' });
        }
        
        const pagesNum = parseInt(pages);
        if (isNaN(pagesNum) || pagesNum <= 0) {
            return res.status(400).json({ error: 'Pages must be a positive number' });
        }
        
        // Проверяем, есть ли полки у пользователя
        const existingShelves = await Shelf.findAll({ where: { user: user } });
        
        // если нет, создаем
        let targetShelfId = shelfId;
        if (existingShelves.length === 0) {
            const defaultShelf = await Shelf.create({
                name: 'Полка 1',
                capacity: 100,
                shelfIndex: 0,
                user: user
            });
            targetShelfId = defaultShelf.id;
        }
        
        // Если указана полка, проверяем вместимость
        if (targetShelfId) {
            const shelf = await Shelf.findOne({ where: { id: targetShelfId, user: user } });
            if (!shelf) {
                return res.status(404).json({ error: 'Shelf not found' });
            }
            
        
            const booksOnShelf = await Book.findAll({ where: { shelfId: targetShelfId } });
            const usedPages = booksOnShelf.reduce((sum, book) => sum + book.pages, 0);
            
            if (usedPages + pagesNum > shelf.capacity) {
                return res.status(400).json({ 
                    error: 'Книга не помещается на эту полку. Превышена вместимость полки.' 
                });
            }
        }
        
        // автоматически распределяем книгу на полку
        const book = await Book.create({ title, pages: pagesNum, user, shelfId: targetShelfId || null });
        res.json({ book });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST маршрут для удаления книги через форму
app.post('/books/:id/delete', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const bookId = req.params.id;
        
        const book = await Book.findOne({ where: { id: bookId, user: user } });
        if (!book) {
            return res.redirect('/');
        }
        
        await book.destroy();
        
        // Перераспределяем книги после удаления
        const books = await Book.findAll({ 
            where: { user: user },
            order: [['title', 'ASC']]
        });
        await distributeBooksToShelves(books, user);
        
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

app.delete('/api/books/:id', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const bookId = req.params.id;
        
        const book = await Book.findOne({ where: { id: bookId, user: user } });
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        await book.destroy();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST маршрут для создания полки через форму
app.post('/shelves', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const { name, capacity } = req.body;
        
        if (!name || !capacity) {
            const books = await Book.findAll({ 
                where: { user: user },
                order: [['title', 'ASC']]
            });
            let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
            if (!shelfSettings) {
                shelfSettings = await ShelfSettings.create({
                    user: user,
                    numberOfShelves: 5,
                    shelfCapacity: 10
                });
            }
            const shelves = await distributeBooksToShelves(books, user);
            
            return res.render('index', {
                currentUser: user,
                shelves: shelves,
                shelfSettings: shelfSettings,
                addBookError: null,
                formData: null,
                showAddShelf: true,
                editingShelfId: null,
                shelfErrors: {}
            });
        }
        
        const capacityNum = parseInt(capacity);
        if (isNaN(capacityNum) || capacityNum <= 0) {
            const books = await Book.findAll({ 
                where: { user: user },
                order: [['title', 'ASC']]
            });
            let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
            if (!shelfSettings) {
                shelfSettings = await ShelfSettings.create({
                    user: user,
                    numberOfShelves: 5,
                    shelfCapacity: 10
                });
            }
            const shelves = await distributeBooksToShelves(books, user);
            
            return res.render('index', {
                currentUser: user,
                shelves: shelves,
                shelfSettings: shelfSettings,
                addBookError: null,
                formData: null,
                showAddShelf: true,
                editingShelfId: null,
                shelfErrors: {}
            });
        }
        
        // Находим максимальный shelfIndex для этого пользователя
        const maxShelf = await Shelf.findOne({
            where: { user: user },
            order: [['shelfIndex', 'DESC']]
        });
        
        const nextIndex = maxShelf ? maxShelf.shelfIndex + 1 : 0;
        
        await Shelf.create({
            name: name.trim(),
            capacity: capacityNum,
            shelfIndex: nextIndex,
            user: user
        });
        
        res.redirect('/');
    } catch (error) {
        const books = await Book.findAll({ 
            where: { user: req.user.username },
            order: [['title', 'ASC']]
        });
        let shelfSettings = await ShelfSettings.findOne({ where: { user: req.user.username } });
        if (!shelfSettings) {
            shelfSettings = await ShelfSettings.create({
                user: req.user.username,
                numberOfShelves: 5,
                shelfCapacity: 10
            });
        }
        const shelves = await distributeBooksToShelves(books, req.user.username);
        
        res.render('index', {
            currentUser: req.user.username,
            shelves: shelves,
            shelfSettings: shelfSettings,
            addBookError: null,
            formData: null,
            showAddShelf: true,
            editingShelfId: null,
            shelfErrors: {}
        });
    }
});

// Создание новой полки
app.post('/api/shelves', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const { name, capacity } = req.body;
        
        if (!name || !capacity) {
            return res.status(400).json({ error: 'Name and capacity are required' });
        }
        
        const capacityNum = parseInt(capacity);
        if (isNaN(capacityNum) || capacityNum <= 0) {
            return res.status(400).json({ error: 'Capacity must be a positive number' });
        }
        
        // Находим максимальный shelfIndex для этого пользователя
        const maxShelf = await Shelf.findOne({
            where: { user: user },
            order: [['shelfIndex', 'DESC']]
        });
        
        const nextIndex = maxShelf ? maxShelf.shelfIndex + 1 : 0;
        
        const shelf = await Shelf.create({
            name: name.trim(),
            capacity: capacityNum,
            shelfIndex: nextIndex,
            user: user
        });
        
        res.json({ shelf });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST маршрут для обновления полки через форму
app.post('/shelves/:id', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const shelfId = req.params.id;
        const { name, capacity } = req.body;
        
        const shelf = await Shelf.findOne({ where: { id: shelfId, user: user } });
        if (!shelf) {
            return res.redirect('/');
        }
        
        const shelfErrors = {};
        
        if (name !== undefined) {
            shelf.name = name;
        }
        
        if (capacity !== undefined) {
            const capacityNum = parseInt(capacity);
            if (isNaN(capacityNum) || capacityNum <= 0) {
                const books = await Book.findAll({ 
                    where: { user: user },
                    order: [['title', 'ASC']]
                });
                let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
                if (!shelfSettings) {
                    shelfSettings = await ShelfSettings.create({
                        user: user,
                        numberOfShelves: 5,
                        shelfCapacity: 10
                    });
                }
                const shelves = await distributeBooksToShelves(books, user);
                shelfErrors[shelfId] = 'Вместимость должна быть положительным числом';
                
                return res.render('index', {
                    currentUser: user,
                    shelves: shelves,
                    shelfSettings: shelfSettings,
                    addBookError: null,
                    formData: null,
                    showAddShelf: false,
                    editingShelfId: shelfId,
                    shelfErrors: shelfErrors
                });
            }
            
            // Проверяем, превышает ли вместимость
            const booksOnShelf = await Book.findAll({ where: { shelfId: shelfId } });
            const usedPages = booksOnShelf.reduce((sum, book) => sum + book.pages, 0);
            
            if (usedPages > capacityNum) {
                const books = await Book.findAll({ 
                    where: { user: user },
                    order: [['title', 'ASC']]
                });
                let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
                if (!shelfSettings) {
                    shelfSettings = await ShelfSettings.create({
                        user: user,
                        numberOfShelves: 5,
                        shelfCapacity: 10
                    });
                }
                const shelves = await distributeBooksToShelves(books, user);
                shelfErrors[shelfId] = 'Новая вместимость меньше текущего использования полки';
                
                return res.render('index', {
                    currentUser: user,
                    shelves: shelves,
                    shelfSettings: shelfSettings,
                    addBookError: null,
                    formData: null,
                    showAddShelf: false,
                    editingShelfId: shelfId,
                    shelfErrors: shelfErrors
                });
            }
            
            shelf.capacity = capacityNum;
        }
        
        await shelf.save();
        
        // Перераспределяем книги после редактирования полки
        const books = await Book.findAll({ 
            where: { user: user },
            order: [['title', 'ASC']]
        });
        await distributeBooksToShelves(books, user);
        
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

// Обновление полки 
app.put('/api/shelves/:id', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const shelfId = req.params.id;
        const { name, capacity } = req.body;
        
        const shelf = await Shelf.findOne({ where: { id: shelfId, user: user } });
        if (!shelf) {
            return res.status(404).json({ error: 'Shelf not found' });
        }
        
        if (name !== undefined) {
            shelf.name = name;
        }
        
        if (capacity !== undefined) {
            const capacityNum = parseInt(capacity);
            if (isNaN(capacityNum) || capacityNum <= 0) {
                return res.status(400).json({ error: 'Capacity must be a positive number' });
            }
            
            // превышает ли вместимость 
            const booksOnShelf = await Book.findAll({ where: { shelfId: shelfId } });
            const usedPages = booksOnShelf.reduce((sum, book) => sum + book.pages, 0);
            
            if (usedPages > capacityNum) {
                return res.status(400).json({ 
                    error: 'Новая вместимость меньше текущего использования полки' 
                });
            }
            
            shelf.capacity = capacityNum;
        }
        
        await shelf.save();
        res.json({ shelf });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// POST маршрут для удаления полки через форму
app.post('/shelves/:id/delete', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const shelfId = req.params.id;
        
        const shelf = await Shelf.findOne({ where: { id: shelfId, user: user } });
        if (!shelf) {
            return res.redirect('/');
        }
        
        // Удаляем все книги на полке
        const booksOnShelf = await Book.findAll({ where: { shelfId: shelfId } });
        for (const book of booksOnShelf) {
            await book.destroy();
        }
        
        // Удаляем полку
        await shelf.destroy();
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

app.delete('/api/shelves/:id', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const shelfId = req.params.id;
        
        const shelf = await Shelf.findOne({ where: { id: shelfId, user: user } });
        if (!shelf) {
            return res.status(404).json({ error: 'Shelf not found' });
        }
        
       
        const booksOnShelf = await Book.findAll({ where: { shelfId: shelfId } });
        
      
        for (const book of booksOnShelf) {
            await book.destroy();
        }
        
       
        await shelf.destroy();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST маршрут для перемещения книги через форму
app.post('/books/:id/move', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const bookId = req.params.id;
        const { shelfId } = req.body;
        
        const book = await Book.findOne({ where: { id: bookId, user: user } });
        if (!book) {
            return res.redirect('/');
        }
        
        if (!shelfId) {
            return res.redirect('/');
        }
        
        // Проверяем существование полки
        const shelf = await Shelf.findOne({ where: { id: shelfId, user: user } });
        if (!shelf) {
            return res.redirect('/');
        }
        
        // Подсчитываем текущее использование полки (исключая текущую книгу, если она уже на этой полке)
        const booksOnShelf = await Book.findAll({ 
            where: { shelfId: shelfId },
            attributes: ['id', 'pages']
        });
        const usedPages = booksOnShelf
            .filter(b => b.id != bookId)
            .reduce((sum, b) => sum + b.pages, 0);
        
        if (usedPages + book.pages > shelf.capacity) {
            // Перераспределяем книги для отображения ошибки
            const books = await Book.findAll({ 
                where: { user: user },
                order: [['title', 'ASC']]
            });
            let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
            if (!shelfSettings) {
                shelfSettings = await ShelfSettings.create({
                    user: user,
                    numberOfShelves: 5,
                    shelfCapacity: 10
                });
            }
            const shelves = await distributeBooksToShelves(books, user);
            
            return res.render('index', {
                currentUser: user,
                shelves: shelves,
                shelfSettings: shelfSettings,
                addBookError: 'Книга не помещается на эту полку. Превышена вместимость полки.',
                formData: null,
                showAddShelf: false,
                editingShelfId: null,
                shelfErrors: {}
            });
        }
        
        book.shelfId = shelfId;
        await book.save();
        
        // Перераспределяем книги после перемещения
        const books = await Book.findAll({ 
            where: { user: user },
            order: [['title', 'ASC']]
        });
        await distributeBooksToShelves(books, user);
        
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

// Перемещение книги на полку
app.put('/api/books/:id/move', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const bookId = req.params.id;
        const { shelfId } = req.body;
        
        const book = await Book.findOne({ where: { id: bookId, user: user } });
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        if (!shelfId) {
            return res.status(400).json({ error: 'Shelf ID is required' });
        }
        
        // Проверяем существование полки
        const shelf = await Shelf.findOne({ where: { id: shelfId, user: user } });
        if (!shelf) {
            return res.status(404).json({ error: 'Shelf not found' });
        }
        
        // Подсчитываем текущее использование полки (исключая текущую книгу, если она уже на этой полке)
        const booksOnShelf = await Book.findAll({ 
            where: { shelfId: shelfId },
            attributes: ['id', 'pages']
        });
        const usedPages = booksOnShelf
            .filter(b => b.id !== bookId)
            .reduce((sum, b) => sum + b.pages, 0);
        
        if (usedPages + book.pages > shelf.capacity) {
            return res.status(400).json({ 
                error: 'Книга не помещается на эту полку. Превышена вместимость полки.' 
            });
        }
        
        book.shelfId = shelfId;
        await book.save();
        res.json({ book });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/', auth, async function(req, res) {
    try {
        const user = req.user.username;
        const books = await Book.findAll({ 
            where: { user: user },
            order: [['title', 'ASC']]
        });
        
        // Получаем настройки полок 
        let shelfSettings = await ShelfSettings.findOne({ where: { user: user } });
        if (!shelfSettings) {
            shelfSettings = await ShelfSettings.create({
                user: user,
                numberOfShelves: 5,
                shelfCapacity: 10
            });
        }
        
        // Инициализируем полки, если их нет
        const existingShelves = await Shelf.findAll({ where: { user: user } });
        if (existingShelves.length === 0) {
            await initializeShelves(user, shelfSettings.numberOfShelves, shelfSettings.shelfCapacity);
        }
        
        // Распределяем книги по полкам
        const shelves = await distributeBooksToShelves(books, user);
        
        res.render('index', {
            currentUser: user,
            shelves: shelves,
            shelfSettings: shelfSettings,
            addBookError: null,
            formData: null,
            showAddShelf: false,
            editingShelfId: null,
            shelfErrors: {}
        });
    } catch (error) {
        res.status(500).send('Ошибка загрузки данных: ' + error.message);
    }
});


app.listen(3000, () => {
    console.log("server started");
});