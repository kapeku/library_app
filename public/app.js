const { useState, useEffect } = React;


function BookItem({ book, onDelete, onMove, allShelves, currentShelfId }) {
    const [showMoveMenu, setShowMoveMenu] = useState(false);
    
    const handleMove = async (targetShelfId) => {
        setShowMoveMenu(false);
        if (targetShelfId === currentShelfId) return;
        try {
            await onMove(book.id, targetShelfId);
        } catch (err) {
            alert(err.message || 'Ошибка при перемещении книги');
        }
    };
    
    return (
        <div className="book-item">
            <div className="book-info">
                <div className="book-title">{book.title}</div>
                <div className="book-pages">{book.pages} стр.</div>
            </div>
            <div className="book-actions">
                {onMove && allShelves && allShelves.length > 0 && (
                    <div className="move-book-container">
                        <button
                            className="btn-move"
                            onClick={() => setShowMoveMenu(!showMoveMenu)}
                            title="Переместить книгу"
                        >
                            ⇄
                        </button>
                        {showMoveMenu && (
                            <div className="move-menu">
                                <div className="move-menu-header">Переместить на:</div>
                                {allShelves.map(shelf => (
                                    <button
                                        key={shelf.id}
                                        className={`move-menu-item ${shelf.id === currentShelfId ? 'current' : ''}`}
                                        onClick={() => handleMove(shelf.id)}
                                        disabled={shelf.id === currentShelfId}
                                    >
                                        {shelf.name || `Полка ${shelf.shelfIndex + 1}`}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <button
                    className="btn-delete"
                    onClick={() => onDelete(book.id)}
                    title="Удалить книгу"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}


function Shelf({ shelf, books, shelfCapacity, usedPages, onDeleteBook, onEditShelf, onMoveBook, onDeleteShelf, allShelves }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(shelf.name || '');
    const [editCapacity, setEditCapacity] = useState(shelf.capacity || shelfCapacity);
    const [error, setError] = useState('');
    
    const usagePercent = shelfCapacity > 0 ? (usedPages / shelfCapacity) * 100 : 0;
    const usageClass = usagePercent > 100 ? 'overfull' : usagePercent > 90 ? 'almost-full' : '';
    
    const handleSave = async (e) => {
        e.preventDefault();
        setError('');
        
        try {
            await onEditShelf(shelf.id, editName, editCapacity);
            setIsEditing(false);
        } catch (err) {
            setError(err.message || 'Ошибка при сохранении');
        }
    };
    
    const handleCancel = () => {
        setEditName(shelf.name || '');
        setEditCapacity(shelf.capacity || shelfCapacity);
        setError('');
        setIsEditing(false);
    };
    
    return (
        <div className={`shelf-section ${usageClass}`}>
            <div className="shelf-header">
                {isEditing ? (
                    <form onSubmit={handleSave} className="shelf-edit-form">
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Название полки"
                            className="shelf-name-input"
                            required
                        />
                        <div className="shelf-edit-controls">
                            <label>
                                Вместимость:
                                <input
                                    type="number"
                                    value={editCapacity}
                                    onChange={(e) => setEditCapacity(e.target.value)}
                                    min="1"
                                    required
                                    className="shelf-capacity-input"
                                />
                            </label>
                            <div className="shelf-edit-buttons">
                                <button type="submit" className="btn-save">Сохранить</button>
                                <button type="button" onClick={handleCancel} className="btn-cancel">Отмена</button>
                            </div>
                        </div>
                        {error && <div className="error-message">{error}</div>}
                    </form>
                ) : (
                    <>
                        <h2>{shelf.name || `Полка ${shelf.shelfIndex + 1}`}</h2>
                        <div className="shelf-actions">
                            <button 
                                onClick={() => setIsEditing(true)} 
                                className="btn-edit-shelf"
                                title="Редактировать полку"
                            >
                                ✎
                            </button>
                            {onDeleteShelf && (
                                <button 
                                    onClick={() => onDeleteShelf(shelf.id)} 
                                    className="btn-delete-shelf"
                                    title="Удалить полку"
                                >
                                    🗑
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
            <div className="shelf-usage">
                <span>Использовано: {usedPages} / {shelfCapacity} стр.</span>
                <div className="usage-bar">
                    <div 
                        className="usage-fill" 
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    ></div>
                </div>
            </div>
            {books.length === 0 ? (
                <div className="empty-list">Полка пуста</div>
            ) : (
                <div className="books-list">
                    {books.map(book => (
                        <BookItem
                            key={book.id}
                            book={book}
                            onDelete={onDeleteBook}
                            onMove={onMoveBook}
                            allShelves={allShelves}
                            currentShelfId={shelf.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}


function App() {
    const [shelves, setShelves] = useState([]);
    const [shelfSettings, setShelfSettings] = useState({ numberOfShelves: 5, shelfCapacity: 10 });
    const [newBookTitle, setNewBookTitle] = useState('');
    const [newBookPages, setNewBookPages] = useState('');
    const [newBookShelfId, setNewBookShelfId] = useState('');
    const [currentUser, setCurrentUser] = useState('');
    const [loading, setLoading] = useState(true);
    const [addBookError, setAddBookError] = useState('');
    const [showAddShelf, setShowAddShelf] = useState(false);
    const [newShelfName, setNewShelfName] = useState('');
    const [newShelfCapacity, setNewShelfCapacity] = useState('');

    
    const checkAuth = (response) => {
        if (response.status === 401) {
            window.location.href = '/login';
            return false;
        }
        return true;
    };

    
    const loadBooks = async () => {
        try {
            const response = await fetch('/api/books', {
                credentials: 'include'
            });
            if (!checkAuth(response)) return;
            if (response.ok) {
                const data = await response.json();
                setShelves(data.shelves || []);
                if (data.shelfSettings) {
                    setShelfSettings(data.shelfSettings);
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки книг:', error);
        }
    };

    const loadCurrentUser = async () => {
        try {
            const response = await fetch('/api/current-user', {
                credentials: 'include'
            });
            if (!checkAuth(response)) return;
            if (response.ok) {
                const data = await response.json();
                setCurrentUser(data.username || '');
            }
        } catch (error) {
            console.error('Ошибка загрузки пользователя:', error);
        }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                await Promise.all([loadBooks(), loadCurrentUser()]);
            } catch (error) {
                console.error('Ошибка инициализации:', error);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

  
    const handleAddBook = async (e) => {
        e.preventDefault();
        if (!newBookTitle.trim() || !newBookPages.trim()) return;
        
        setAddBookError('');

        const pagesNum = parseInt(newBookPages);
        
        // Если полка указана явно, проверяем вместимость этой полки
        if (newBookShelfId) {
            const selectedShelf = shelves.find(s => s.id === parseInt(newBookShelfId));
            if (selectedShelf) {
                if (selectedShelf.usedPages + pagesNum > selectedShelf.capacity) {
                    setAddBookError('Книга не помещается на выбранную полку. Превышена вместимость полки.');
                    return;
                }
            }
        } else if (shelves.length > 0) {
            // Если полка не указана, проверяем, помещается ли книга хотя бы на одну полку
            let canFit = false;
            for (const shelf of shelves) {
                if (shelf.usedPages + pagesNum <= shelf.capacity) {
                    canFit = true;
                    break;
                }
            }
            
            if (!canFit) {
                setAddBookError('Эта книга не помещается ни на одну из доступных полок. Пожалуйста, создайте новую полку или увеличьте вместимость существующих.');
                return;
            }
        }

        try {
            const response = await fetch('/api/books', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ 
                    title: newBookTitle,
                    pages: pagesNum,
                    shelfId: newBookShelfId || null
                }),
            });

            if (!checkAuth(response)) return;
            if (response.ok) {
                setNewBookTitle('');
                setNewBookPages('');
                setNewBookShelfId('');
                setAddBookError('');
                await loadBooks(); // Перезагружаем книги с перераспределением по полкам
            } else {
                const error = await response.json();
                setAddBookError(error.error || 'Неизвестная ошибка');
            }
        } catch (error) {
            console.error('Ошибка добавления книги:', error);
            setAddBookError('Ошибка при добавлении книги');
        }
    };

    const handleDeleteBook = async (bookId) => {
        if (!confirm('Вы уверены, что хотите удалить эту книгу?')) {
            return;
        }

        try {
            const response = await fetch(`/api/books/${bookId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!checkAuth(response)) return;
            if (response.ok) {
                await loadBooks(); // Перезагружаем книги с перераспределением по полкам
            } else {
                const error = await response.json();
                alert('Ошибка при удалении книги: ' + (error.error || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Ошибка удаления книги:', error);
            alert('Ошибка при удалении книги');
        }
    };

    const handleAddShelf = async (e) => {
        e.preventDefault();
        if (!newShelfName.trim() || !newShelfCapacity.trim()) return;

        try {
            const response = await fetch('/api/shelves', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ 
                    name: newShelfName,
                    capacity: parseInt(newShelfCapacity)
                }),
            });

            if (!checkAuth(response)) return;
            if (response.ok) {
                setNewShelfName('');
                setNewShelfCapacity('');
                setShowAddShelf(false);
                await loadBooks();
            } else {
                const error = await response.json();
                alert('Ошибка при добавлении полки: ' + (error.error || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Ошибка добавления полки:', error);
            alert('Ошибка при добавлении полки');
        }
    };
    
    const handleEditShelf = async (shelfId, name, capacity) => {
        try {
            const response = await fetch(`/api/shelves/${shelfId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ name, capacity: parseInt(capacity) }),
            });

            if (!checkAuth(response)) return;
            if (response.ok) {
                await loadBooks();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка при сохранении полки');
            }
        } catch (error) {
            throw error;
        }
    };
    
    const handleMoveBook = async (bookId, shelfId) => {
        try {
            const response = await fetch(`/api/books/${bookId}/move`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ shelfId }),
            });

            if (!checkAuth(response)) return;
            if (response.ok) {
                await loadBooks();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка при перемещении книги');
            }
        } catch (error) {
            throw error;
        }
    };
    
    const handleDeleteShelf = async (shelfId) => {
        if (!confirm('Вы уверены, что хотите удалить эту полку? Все книги на этой полке также будут удалены.')) {
            return;
        }

        try {
            const response = await fetch(`/api/shelves/${shelfId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!checkAuth(response)) return;
            if (response.ok) {
                await loadBooks();
            } else {
                const error = await response.json();
                alert('Ошибка при удалении полки: ' + (error.error || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Ошибка удаления полки:', error);
            alert('Ошибка при удалении полки');
        }
    };

    if (loading) {
        return <div className="loading">Загрузка...</div>;
    }

    return (
        <div className="app">
            <div className="user-info">
                <strong>Пользователь: {currentUser}</strong> | 
                <a href="/logout"> Выход</a>
            </div>
            
            <h1>Домашняя библиотека</h1>
            
            <div className="actions-bar">
                <form onSubmit={handleAddBook} className="add-form">
                    <input
                        type="text"
                        value={newBookTitle}
                        onChange={(e) => setNewBookTitle(e.target.value)}
                        placeholder="Название книги"
                        required
                    />
                    <input
                        type="number"
                        value={newBookPages}
                        onChange={(e) => setNewBookPages(e.target.value)}
                        placeholder="Количество страниц"
                        min="1"
                        required
                    />
                    <select
                        value={newBookShelfId}
                        onChange={(e) => setNewBookShelfId(e.target.value)}
                        className="shelf-select"
                    >
                        <option value="">Автоматически</option>
                        {shelves.map(shelf => (
                            <option key={shelf.id} value={shelf.id}>
                                {shelf.name || `Полка ${shelf.shelfIndex + 1}`}
                            </option>
                        ))}
                    </select>
                    <input type="submit" value="Добавить книгу" />
                    {addBookError && <div className="error-message">{addBookError}</div>}
                </form>
                <button 
                    onClick={() => setShowAddShelf(!showAddShelf)} 
                    className="btn-add-shelf"
                >
                    {showAddShelf ? 'Скрыть' : 'Добавить полку'}
                </button>
            </div>

            {showAddShelf && (
                <form onSubmit={handleAddShelf} className="add-shelf-form">
                    <h3>Добавить новую полку</h3>
                    <div className="form-row">
                        <label>
                            Название полки:
                            <input
                                type="text"
                                value={newShelfName}
                                onChange={(e) => setNewShelfName(e.target.value)}
                                placeholder="Введите название полки"
                                required
                            />
                        </label>
                        <label>
                            Вместимость полки (в страницах):
                            <input
                                type="number"
                                value={newShelfCapacity}
                                onChange={(e) => setNewShelfCapacity(e.target.value)}
                                min="1"
                                required
                            />
                        </label>
                        <input type="submit" value="Добавить полку" />
                    </div>
                </form>
            )}
            
            <div className="shelves-container">
                {shelves.map((shelf) => (
                    <Shelf
                        key={shelf.id}
                        shelf={shelf}
                        books={shelf.books}
                        shelfCapacity={shelf.capacity || shelfSettings.shelfCapacity}
                        usedPages={shelf.usedPages}
                        onDeleteBook={handleDeleteBook}
                        onEditShelf={handleEditShelf}
                        onMoveBook={handleMoveBook}
                        onDeleteShelf={handleDeleteShelf}
                        allShelves={shelves}
                    />
                ))}
                {shelves.length === 0 && !loading && (
                    <div className="empty-library">
                        <p>Библиотека пуста. Добавьте первую книгу!</p>
                    </div>
                )}
            </div>
        </div>
    );
}


const styles = `
    .app {
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px;
    }
    .user-info {
        text-align: right;
        margin-bottom: 20px;
    }
    .user-info a {
        color: #666;
        text-decoration: none;
        padding: 5px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-left: 10px;
    }
    h1 {
        color: #333;
        text-align: center;
        margin-bottom: 30px;
        font-size: 32px;
    }
    .actions-bar {
        display: flex;
        gap: 20px;
        align-items: flex-start;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }
    .add-form {
        flex: 1;
        display: flex;
        gap: 10px;
        background-color: #ffffff;
        border: 2px solid #333;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        flex-wrap: wrap;
    }
    .add-form input[type="text"],
    .add-form input[type="number"],
    .add-form select {
        padding: 10px;
        min-width: 200px;
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
    }
    .shelf-select {
        min-width: 150px;
    }
    .error-message {
        color: #f44336;
        font-size: 12px;
        margin-top: 5px;
        grid-column: 1 / -1;
    }
    .add-form input[type="submit"] {
        padding: 10px 20px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
    }
    .add-form input[type="submit"]:hover {
        background-color: #45a049;
    }
    .btn-add-shelf {
        padding: 10px 20px;
        background-color: #9C27B0;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        height: fit-content;
    }
    .btn-add-shelf:hover {
        background-color: #7B1FA2;
    }
    .add-shelf-form {
        background-color: #ffffff;
        border: 2px solid #9C27B0;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .add-shelf-form h3 {
        margin-top: 0;
        color: #9C27B0;
        margin-bottom: 15px;
    }
    .add-shelf-form .form-row {
        display: flex;
        gap: 20px;
        align-items: flex-end;
        flex-wrap: wrap;
    }
    .add-shelf-form label {
        display: flex;
        flex-direction: column;
        gap: 5px;
        flex: 1;
        min-width: 200px;
    }
    .add-shelf-form label span {
        font-weight: 500;
        color: #555;
    }
    .add-shelf-form input[type="text"],
    .add-shelf-form input[type="number"] {
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
    }
    .add-shelf-form input[type="submit"] {
        padding: 10px 20px;
        background-color: #9C27B0;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        height: fit-content;
    }
    .add-shelf-form input[type="submit"]:hover {
        background-color: #7B1FA2;
    }
    .shelves-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
    }
    .shelf-section {
        background-color: #ffffff;
        border: 2px solid #ddd;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .shelf-section.almost-full {
        border-color: #ff9800;
    }
    .shelf-section.overfull {
        border-color: #f44336;
    }
    .shelf-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }
    .shelf-section h2 {
        margin-top: 0;
        color: #555;
        border-bottom: 2px solid #ddd;
        padding-bottom: 10px;
        flex: 1;
    }
    .shelf-actions {
        display: flex;
        gap: 5px;
        align-items: center;
        margin-left: 10px;
    }
    .btn-edit-shelf {
        padding: 5px 10px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        transition: background-color 0.3s;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-edit-shelf:hover {
        background-color: #0b7dda;
    }
    .btn-delete-shelf {
        padding: 5px 10px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        transition: background-color 0.3s;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-delete-shelf:hover {
        background-color: #da190b;
    }
    .shelf-edit-form {
        width: 100%;
    }
    .shelf-name-input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 10px;
    }
    .shelf-edit-controls {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
    }
    .shelf-edit-controls label {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 14px;
    }
    .shelf-capacity-input {
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 4px;
        width: 80px;
    }
    .shelf-edit-buttons {
        display: flex;
        gap: 5px;
    }
    .btn-save {
        padding: 5px 15px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    }
    .btn-save:hover {
        background-color: #45a049;
    }
    .btn-cancel {
        padding: 5px 15px;
        background-color: #999;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    }
    .btn-cancel:hover {
        background-color: #777;
    }
    .shelf-usage {
        margin-bottom: 15px;
        padding: 10px;
        background-color: #f9f9f9;
        border-radius: 4px;
    }
    .shelf-usage span {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        color: #666;
        font-weight: 500;
    }
    .usage-bar {
        width: 100%;
        height: 20px;
        background-color: #e0e0e0;
        border-radius: 10px;
        overflow: hidden;
    }
    .usage-fill {
        height: 100%;
        background-color: #4CAF50;
        transition: width 0.3s;
    }
    .almost-full .usage-fill {
        background-color: #ff9800;
    }
    .overfull .usage-fill {
        background-color: #f44336;
    }
    .books-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .book-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        background-color: #f9f9f9;
        border-radius: 4px;
        border-left: 4px solid #8B4513;
    }
    .book-actions {
        display: flex;
        gap: 5px;
        align-items: center;
    }
    .move-book-container {
        position: relative;
    }
    .btn-move {
        padding: 5px 10px;
        background-color: #ff9800;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        transition: background-color 0.3s;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-move:hover {
        background-color: #f57c00;
    }
    .move-menu {
        position: absolute;
        top: 35px;
        right: 0;
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 100;
        min-width: 200px;
        max-height: 300px;
        overflow-y: auto;
    }
    .move-menu-header {
        padding: 8px 12px;
        font-weight: bold;
        border-bottom: 1px solid #ddd;
        background-color: #f5f5f5;
        font-size: 12px;
        color: #666;
    }
    .move-menu-item {
        display: block;
        width: 100%;
        padding: 8px 12px;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 14px;
        color: #333;
        transition: background-color 0.2s;
    }
    .move-menu-item:hover:not(:disabled) {
        background-color: #f0f0f0;
    }
    .move-menu-item:disabled {
        color: #999;
        cursor: not-allowed;
        font-style: italic;
    }
    .move-menu-item.current {
        background-color: #e3f2fd;
        font-weight: bold;
    }
    .book-info {
        flex: 1;
    }
    .book-title {
        font-weight: bold;
        color: #333;
        margin-bottom: 4px;
    }
    .book-pages {
        font-size: 12px;
        color: #666;
    }
    .btn-delete {
        padding: 5px 10px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        transition: background-color 0.3s;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .btn-delete:hover {
        background-color: #da190b;
    }
    .empty-list {
        color: #999;
        font-style: italic;
        text-align: center;
        padding: 20px;
    }
    .empty-library {
        grid-column: 1 / -1;
        text-align: center;
        padding: 50px;
        background-color: #ffffff;
        border: 2px dashed #ddd;
        border-radius: 8px;
    }
    .empty-library p {
        font-size: 18px;
        color: #999;
    }
    .loading {
        text-align: center;
        padding: 50px;
        font-size: 18px;
    }
`;


const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
