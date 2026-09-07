const express = require('express');
const router = express.Router();
const { prepare } = require('../config/database');

router.get('/', (req, res) => {
  try {
    const plans = prepare('SELECT * FROM plans WHERE is_active = 1').all();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener planes' });
  }
});

module.exports = router;
