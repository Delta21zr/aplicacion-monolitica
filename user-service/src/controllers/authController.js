const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Librería ficticia/real para validación de tokens de Google (OAuth2Client)
// const { OAuth2Client } = require('google-auth-library');
// const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '24h';

// Función auxiliar para generar el JWT propio del User Service
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// 1. VALIDACIÓN NATIVA: Registro
const register = async (req, res) => {
    const { email, password, full_name } = req.body;

    try {
        // Verificar si el correo ya existe
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'El correo ya está registrado.' });
        }

        // Encriptar la contraseña (hash localmente)
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insertar usuario
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, provider) 
             VALUES ($1, $2, $3, 'local') RETURNING id, email, full_name, role`,
            [email, passwordHash, full_name]
        );

        const newUser = result.rows[0];
        
        // Generar JWT
        const token = generateToken(newUser);

        res.status(201).json({ user: newUser, token });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
};

// 1. VALIDACIÓN NATIVA: Login
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        // Verificar si el usuario existe y si su método de registro fue 'local'
        if (!user || user.provider !== 'local') {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Comparar contraseña
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Generar JWT
        const token = generateToken(user);
        
        res.json({ 
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }, 
            token 
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
};

// 2. VALIDACIÓN EXTERNA (OAuth / Terceros)
const externalLogin = async (req, res) => {
    const { provider, externalToken } = req.body; // ej. provider: 'google', externalToken: 'ey...'

    try {
        let externalUser = null;

        // Validar firma del token según el proveedor
        if (provider === 'google') {
            // Ejemplo de validación (simulada aquí, usar google-auth-library en prod)
            /*
            const ticket = await googleClient.verifyIdToken({
                idToken: externalToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            const payload = ticket.getPayload();
            */
            // Simulación del payload extraído del proveedor:
            externalUser = {
                email: 'usuario.oauth@gmail.com', // Extraído del token
                full_name: 'Usuario OAuth', // Extraído del token
                provider_id: '1234567890abcdef' // sub / ID único del proveedor
            };
        } else if (provider === 'auth0' || provider === 'firebase') {
            // Implementar la validación correspondiente
            return res.status(501).json({ message: `Validación para ${provider} aún no implementada.` });
        } else {
            return res.status(400).json({ message: 'Proveedor no soportado.' });
        }

        // Buscar si el usuario ya existe en nuestra base de datos
        let result = await pool.query('SELECT * FROM users WHERE email = $1', [externalUser.email]);
        let user = result.rows[0];

        if (!user) {
            // Si es su primera vez, registrarlo sin contraseña
            const insertResult = await pool.query(
                `INSERT INTO users (email, full_name, provider, provider_id) 
                 VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role`,
                [externalUser.email, externalUser.full_name, provider, externalUser.provider_id]
            );
            user = insertResult.rows[0];
        } else {
            // Si el usuario existe, podemos actualizar su provider_id si no lo tenía 
            // (esto depende de las reglas de negocio para vincular cuentas)
            if (!user.provider_id || user.provider !== provider) {
                 await pool.query(
                     'UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3', 
                     [provider, externalUser.provider_id, user.id]
                 );
                 user.provider = provider;
                 user.provider_id = externalUser.provider_id;
            }
        }

        // Generar NUESTRO propio JWT, sin importar cómo se validó externamente
        const token = generateToken(user);
        
        res.json({ 
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }, 
            token 
        });

    } catch (error) {
        console.error('Error en login externo:', error);
        res.status(401).json({ message: 'Firma de token externo inválida o expirada.' });
    }
};

module.exports = { register, login, externalLogin };
