const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const authCtrl = require('../controllers/auth.controller');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

// public
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
], validate, authCtrl.register);

router.post('/login', authCtrl.login);
router.post('/refresh-token', authCtrl.refreshToken);
router.post('/forgot-password', authCtrl.forgotPassword);
router.put('/reset-password/:token', authCtrl.resetPassword);

// protected
router.use(protect);

router.get('/me',              authCtrl.getMe);
router.put('/me',              authCtrl.updateMe);
router.put('/change-password', authCtrl.changePassword);
router.post('/logout',         authCtrl.logout);

// admin only
router.get('/users',           authorize('admin'), authCtrl.getUsers);
router.put('/users/:id',       authorize('admin'), authCtrl.updateUser);
router.delete('/users/:id',    authorize('admin'), authCtrl.deleteUser);
router.post('/create-user', authorize('admin'), [
  body('name').trim().notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'dispatcher', 'driver', 'passenger']),
], validate, authCtrl.createUser);

module.exports = router;
