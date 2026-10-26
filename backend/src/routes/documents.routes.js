const express = require('express');
const controller = require('../controllers/documents.controller');

const router = express.Router();

router.post('/upload', controller.upload);
router.get('/documents', controller.list);
router.get('/documents/:id/download', controller.download);

module.exports = router;
