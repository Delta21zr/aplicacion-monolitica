const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rutas de validación nativa
router.post('/register', authController.register);
router.post('/login', authController.login);

// Ruta de validación externa (OAuth / Terceros)
router.post('/external-login', authController.externalLogin);

module.exports = router;
