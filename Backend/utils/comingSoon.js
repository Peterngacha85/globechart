const { config } = require('../config/env');
const { ApiError } = require('./ApiError');

// While COMING_SOON=ON the whole site is closed: every account, the admin included, gets the launch page
const isClosed = () => config.comingSoon.enabled;

// The `comingSoon` flag tells the frontend to switch to the launch page instead of showing an error
const comingSoonError = () => Object.assign(new ApiError(503, 'Globechart is launching soon. Please check back shortly.'), { comingSoon: true });

module.exports = { isClosed, comingSoonError };
