const express = require('express');
const app = express();
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

// Middlewares globales
app.use(express.json()); // Parsing application/json

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Ruta de health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'User Service' });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`User Service escuchando en el puerto ${PORT}`);
    });
}

module.exports = app;
