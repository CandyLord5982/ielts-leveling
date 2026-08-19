// Vietnam timezone utilities
// Keep database in UTC, convert to Vietnam time for business logic

/**
 * Get current date in Vietnam timezone (YYYY-MM-DD format)
 * @returns {string} Vietnam date string
 */
export const getVietnamDate = () => {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh'
  })
}

/**
 * Convert UTC timestamp to Vietnam date (YYYY-MM-DD format)
 * @param {string|Date} utcTimestamp - UTC timestamp
 * @returns {string} Vietnam date string
 */
export const utcToVietnamDate = (utcTimestamp) => {
  const date = new Date(utcTimestamp)
  return date.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh'
  })
}

/**
 * Calculate days difference between two dates in Vietnam timezone
 * @param {string|Date} date1 - Later date
 * @param {string|Date} date2 - Earlier date
 * @returns {number} Number of days difference
 */
export const daysDifferenceVietnam = (date1, date2) => {
  const vnDate1 = typeof date1 === 'string' ? utcToVietnamDate(date1) : getVietnamDate()
  const vnDate2 = typeof date2 === 'string' ? utcToVietnamDate(date2) : getVietnamDate()

  const d1 = new Date(vnDate1)
  const d2 = new Date(vnDate2)

  return Math.floor((d1 - d2) / (1000 * 60 * 60 * 24))
}

/**
 * Check if UTC timestamp is today in Vietnam timezone
 * @param {string|Date} utcTimestamp - UTC timestamp
 * @returns {boolean} True if it's today in Vietnam
 */
export const isTodayInVietnam = (utcTimestamp) => {
  const today = getVietnamDate()
  const targetDate = utcToVietnamDate(utcTimestamp)
  return today === targetDate
}

/**
 * Check if UTC timestamp is yesterday in Vietnam timezone
 * @param {string|Date} utcTimestamp - UTC timestamp
 * @returns {boolean} True if it's yesterday in Vietnam
 */
export const isYesterdayInVietnam = (utcTimestamp) => {
  const today = getVietnamDate()
  const targetDate = utcToVietnamDate(utcTimestamp)
  return daysDifferenceVietnam(today, targetDate) === 1
}