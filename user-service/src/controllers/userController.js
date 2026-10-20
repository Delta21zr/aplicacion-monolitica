const pool = require('../config/db');

// Obtener perfil del usuario autenticado
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id; // Extraído del JWT por el middleware

        const result = await pool.query(
            'SELECT id, email, full_name, role, provider, created_at FROM users WHERE id = $1', 
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        res.json({ profile: result.rows[0] });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
};

// Obtener la libreta de direcciones del usuario
const getAddresses = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', 
            [userId]
        );

        res.json({ addresses: result.rows });
    } catch (error) {
        console.error('Error al obtener direcciones:', error);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
};

// Agregar una nueva dirección
const addAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, address_line_1, address_line_2, city, state, country, postal_code, is_default } = req.body;

        // Si la nueva es por defecto, quitar el flag de la anterior del mismo tipo
        if (is_default) {
            await pool.query(
                'UPDATE addresses SET is_default = false WHERE user_id = $1 AND type = $2 AND is_default = true',
                [userId, type]
            );
        }

        const result = await pool.query(
            `INSERT INTO addresses 
             (user_id, type, address_line_1, address_line_2, city, state, country, postal_code, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [userId, type, address_line_1, address_line_2, city, state, country, postal_code, is_default || false]
        );

        res.status(201).json({ address: result.rows[0] });
    } catch (error) {
        console.error('Error al agregar dirección:', error);
        res.status(500).json({ message: 'Error interno en el servidor.' });
    }
};

module.exports = {
    getProfile,
    getAddresses,
    addAddress
};
