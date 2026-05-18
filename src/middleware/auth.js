const { verifyToken } = require('../utils/jwt');
const { error } = require('../utils/response');

const authenticate = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return error(res, 'Token tidak ditemukan', 401);

    const token = header.split(' ')[1];
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return error(res, 'Token tidak valid atau sudah kadaluarsa', 401);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return error(res, 'Akses ditolak', 403);
  next();
};

module.exports = { authenticate, authorize };