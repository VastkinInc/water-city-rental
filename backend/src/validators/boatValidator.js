import { body } from 'express-validator';
import { BOAT_TYPES } from '../models/Boat.js';

const currentYear = new Date().getFullYear();

export const createBoatValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Boat name is required')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
  body('type')
    .notEmpty().withMessage('Boat type is required')
    .isIn(BOAT_TYPES).withMessage(`Type must be one of: ${BOAT_TYPES.join(', ')}`),
  body('yearBuilt')
    .optional()
    .isInt({ min: 1950, max: currentYear + 1 })
    .withMessage(`Year must be between 1950 and ${currentYear + 1}`),
  body('length')
    .optional()
    .isFloat({ min: 10, max: 200 }).withMessage('Length must be 10-200 ft'),
  body('maxGuests')
    .notEmpty().withMessage('Max guests is required')
    .isInt({ min: 1, max: 50 }).withMessage('Max guests must be 1-50'),
  body('harbor')
    .trim()
    .notEmpty().withMessage('Harbor is required'),
  body('city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('rateType')
    .optional()
    .isIn(['daily', 'hourly']).withMessage('Rate type must be daily or hourly'),
  body('dayRate')
    .if(body('rateType').not().equals('hourly'))
    .notEmpty().withMessage('Day rate is required for daily rate type')
    .bail()
    .isFloat({ gt: 0 }).withMessage('Day rate must be greater than 0'),
  body('hourlyRate')
    .if(body('rateType').equals('hourly'))
    .notEmpty().withMessage('Hourly rate is required for hourly rate type')
    .bail()
    .isFloat({ gt: 0 }).withMessage('Hourly rate must be greater than 0'),
  body('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('Description must be at most 2000 characters'),
  body('freeCancellationHours')
    .optional()
    .isInt({ min: 0, max: 720 }).withMessage('Free cancellation hours must be an integer 0-720')
];

export const updateBoatValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
  body('type')
    .optional()
    .isIn(BOAT_TYPES).withMessage(`Type must be one of: ${BOAT_TYPES.join(', ')}`),
  body('yearBuilt')
    .optional()
    .isInt({ min: 1950, max: currentYear + 1 })
    .withMessage(`Year must be between 1950 and ${currentYear + 1}`),
  body('length')
    .optional()
    .isFloat({ min: 10, max: 200 }).withMessage('Length must be 10-200 ft'),
  body('maxGuests')
    .optional()
    .isInt({ min: 1, max: 50 }).withMessage('Max guests must be 1-50'),
  body('harbor')
    .optional()
    .trim()
    .notEmpty().withMessage('Harbor cannot be empty'),
  body('city')
    .optional()
    .trim()
    .notEmpty().withMessage('City cannot be empty'),
  body('rateType')
    .optional()
    .isIn(['daily', 'hourly']).withMessage('Rate type must be daily or hourly'),
  body('dayRate')
    .optional()
    .isFloat({ gt: 0 }).withMessage('Day rate must be greater than 0'),
  body('hourlyRate')
    .optional()
    .isFloat({ gt: 0 }).withMessage('Hourly rate must be greater than 0'),
  body('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('Description must be at most 2000 characters'),
  body('freeCancellationHours')
    .optional()
    .isInt({ min: 0, max: 720 }).withMessage('Free cancellation hours must be an integer 0-720')
];
