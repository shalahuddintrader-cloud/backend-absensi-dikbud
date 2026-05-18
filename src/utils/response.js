const success = (res, data, message = 'Berhasil', statusCode = 200) =>
  res.status(statusCode).json({ status: 'success', message, data });

const error = (res, message = 'Terjadi kesalahan', statusCode = 500, errors = null) =>
  res.status(statusCode).json({ status: 'error', message, ...(errors && { errors }) });

const paginated = (res, data, pagination) =>
  res.status(200).json({ status: 'success', data, pagination });

module.exports = { success, error, paginated };