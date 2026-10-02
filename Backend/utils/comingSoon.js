const { config } = require('../config/env');
const { ApiError } = require('./ApiError');

// While COMING_SOON=ON only the admin may use the app; everyone else sees the launch page
const isClosedFor = (user) => config.comingSoon.enabled && user?.role !== 'super_admin';

// The `comingSoon` flag tells the frontend to switch to the launch page instead of showing an error
const comingSoonError = () => Object.assign(new ApiError(503, 'Globechart is launching soon. Please check back shortly.'), { comingSoon: true });

module.exports = { isClosedFor, comingSoonError };
