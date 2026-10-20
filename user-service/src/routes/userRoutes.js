const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Todas las rutas en este archivo requieren autenticación
router.use(verifyToken);

// Gestión de perfil
router.get('/profile', userController.getProfile);

// Gestión de libreta de direcciones
router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);

// Ejemplo de ruta exclusiva para administradores
router.get('/admin/users', requireRole('admin'), (req, res) => {
    res.json({ message: 'Lista de usuarios (Solo Admin)' });
});

module.exports = router;
