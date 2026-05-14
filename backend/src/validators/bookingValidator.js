import { body } from 'express-validator';

const isFutureOrToday = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('startDate must be a valid date');
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    throw new Error('startDate must be today or in the future');
  }
  return true;
};

const isAfterStart = (value, { req }) => {
  const end = new Date(value);
  const start = new Date(req.body.startDate);
  if (Number.isNaN(end.getTime())) {
    throw new Error('endDate must be a valid date');
  }
  if (end <= start) {
    throw new Error('endDate must be after startDate');
  }
  return true;
};

export const createBookingValidator = [
  body('boatId')
    .notEmpty().withMessage('boatId is required')
    .bail()
    .isMongoId().withMessage('boatId must be a valid Mongo ObjectId'),
  // Batch 4B-1: captainId is OPTIONAL. Null/undefined/empty string = no captain.
  body('captainId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId().withMessage('captainId must be a valid Mongo ObjectId'),
  body('startDate')
    .notEmpty().withMessage('startDate is required')
    .bail()
    .isISO8601().withMessage('startDate must be ISO8601')
    .bail()
    .custom(isFutureOrToday),
  body('endDate')
    .notEmpty().withMessage('endDate is required')
    .bail()
    .isISO8601().withMessage('endDate must be ISO8601')
    .bail()
    .custom(isAfterStart),
  body('numGuests')
    .notEmpty().withMessage('numGuests is required')
    .bail()
    .isInt({ min: 1, max: 50 }).withMessage('numGuests must be 1-50'),
  body('specialRequests')
    .optional()
    .isString().withMessage('specialRequests must be a string')
    .isLength({ max: 500 }).withMessage('specialRequests max 500 chars')
];

export const cancelBookingValidator = [
  body('cancellationReason')
    .optional()
    .isString().withMessage('cancellationReason must be a string')
    .isLength({ max: 500 }).withMessage('cancellationReason max 500 chars')
];
