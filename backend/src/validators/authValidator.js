import { body } from 'express-validator';

export const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('role')
    .optional()
    .isIn(['customer', 'owner', 'captain'])
    .withMessage('Role must be customer, owner, or captain')
];

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
];

export const updateProfileValidator = [
  body('name').optional().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
  body('phone').optional().trim().isLength({ max: 30 }).withMessage('Phone is too long'),
  body('city').optional().trim().isLength({ max: 80 }).withMessage('City is too long'),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio is too long'),
  body('avatar').optional().isString(),
  body('captainProfile.dayRate').optional().isInt({ min: 0, max: 5000 }).withMessage('Day rate out of range'),
  body('captainProfile.hourlyRate').optional().isInt({ min: 0, max: 1000 }).withMessage('Hourly rate out of range'),
  body('captainProfile.yearsExperience').optional().isInt({ min: 0, max: 70 }).withMessage('Years experience out of range'),
  body('captainProfile.licenseNumber').optional().trim().isLength({ max: 100 }),
  body('captainProfile.bio').optional().trim().isLength({ max: 200 }).withMessage('Captain bio is too long'),
];

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];
