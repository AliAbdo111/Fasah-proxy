const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  username: {
    type: String,
    trim: true,
    default: ''
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  /** Application role: normal API users vs admin UI / management APIs */
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    index: true
  },
  /** Booking package mode: limited(daily+monthly), monthly_only, or open (unlimited). */
  planType: {
    type: String,
    enum: ['limited', 'monthly_only', 'open'],
    default: 'limited',
    index: true
  },
  /** For monthly_only package: enforce daily cap in addition to monthly cap. */
  dailyLimitEnabled: {
    type: Boolean,
    default: false
  },
  /** Extra paid bookings are allowed after monthly quota is exhausted. */
  allowPaidExtra: {
    type: Boolean,
    default: false
  },
  /** Per-booking extra charge when allowPaidExtra=true. */
  extraBookingPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Unified daily cap used by policy engine (separate from legacy per-kind max values). */
  maxDailyBookings: {
    type: Number,
    default: () => {
      const n = parseInt(process.env.MAX_BOOKINGS_PER_DAY || '50', 10);
      return Number.isFinite(n) && n >= 0 ? n : 50;
    },
    min: 0
  },
  /** Unified monthly cap used by policy engine. */
  maxMonthlyBookings: {
    type: Number,
    default: () => {
      const n = parseInt(process.env.MAX_BOOKINGS_PER_MONTH || '1000', 10);
      return Number.isFinite(n) && n >= 0 ? n : 1000;
    },
    min: 0
  },
  bookingCount: {
    type: Number,
    default: 0
  },
  /** Calendar day key (YYYY-MM-DD) in booking timezone (see bookingDailyLimits). */
  lastBookingCountDay: {
    type: String,
    default: ''
  },
  /** Successful transit appointments today (resets when lastBookingCountDay changes) */
  transitBookingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Successful land/import appointments today */
  importBookingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Calendar month key (YYYY-MM) in booking timezone (see bookingDailyLimits). */
  lastBookingCountMonth: {
    type: String,
    default: ''
  },
  /** Successful transit appointments in current UTC month */
  totalMonthlyTransitBookingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Successful import/land appointments in current UTC month */
  totalMonthlyImportBookingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Extra bookings consumed after monthly quota is exhausted (for billing). */
  paidExtraBookingsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Monetary total for paid extra bookings in current month window. */
  paidExtraAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  /** Display / billing label for the subscription package (e.g. باقة 800). */
  packageName: {
    type: String,
    default: '',
    trim: true
  },
  /** Subscription package price in SAR (reference for admin / invoicing). */
  packagePriceSar: {
    type: Number,
    default: 0,
    min: 0
  },
  /** After this instant, bookings are rejected until renewed (optional). */
  subscriptionEndsAt: {
    type: Date,
    default: null
  },
  maxTransitBookingCount: {
    type: Number,
    default: () => {
      const n = parseInt(process.env.MAX_TRANSIT_BOOKINGS_PER_DAY || '50', 10);
      return Number.isFinite(n) && n >= 0 ? n : 50;
    },
    min: 0
  },
  maxImportBookingCount: {
    type: Number,
    default: () => {
      const n = parseInt(process.env.MAX_IMPORT_BOOKINGS_PER_DAY || '50', 10);
      return Number.isFinite(n) && n >= 0 ? n : 50;
    },
    min: 0
  },
  /**
   * Capability flags (extend over time). Examples: transit_booking, import_booking.
   * If undefined/null (legacy users), all known booking features are allowed.
   * Empty array disables all gated actions that require a flag.
   */
  features: {
    type: [String],
    default: undefined
  },
  otp: {
    type: String,
    select: false
  },
  otpExpires: {
    type: Date,
    select: false
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  /**
   * Used to invalidate existing JWTs after password changes.
   * Any JWT with iat < passwordChangedAt will be rejected by auth middleware.
   */
  passwordChangedAt: {
    type: Date,
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.index({ email: 1 });
userSchema.index({ username: 1 }, { sparse: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ resetPasswordToken: 1 });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
