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
  bookingCount: {
    type: Number,
    default: 0
  },
  /** UTC calendar day (YYYY-MM-DD) for which transit/import counts below apply */
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
