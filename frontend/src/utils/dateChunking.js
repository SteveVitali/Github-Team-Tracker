/**
 * Date chunking utilities for consistent cache keys
 *
 * Strategy: Align all date ranges to fixed 30-day boundaries
 * Each chunk is exactly 30 days long
 * This ensures that date ranges use consistent cache keys
 */

// Reference date: January 1, 2024
const REFERENCE_DATE = new Date('2024-01-01T00:00:00Z')

// Chunk size in days (30 days max per chunk)
const CHUNK_SIZE_DAYS = 30

/**
 * Get the start of the chunk for a given date
 * Chunks align to fixed 30-day boundaries from the reference date
 */
export function getChunkStart(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)

  // Calculate days since reference
  const daysSinceReference = Math.floor((d - REFERENCE_DATE) / (1000 * 60 * 60 * 24))

  // Round down to nearest chunk boundary
  const chunksSinceReference = Math.floor(daysSinceReference / CHUNK_SIZE_DAYS)

  // Calculate the start of this chunk
  const chunkStart = new Date(REFERENCE_DATE)
  chunkStart.setUTCDate(chunkStart.getUTCDate() + (chunksSinceReference * CHUNK_SIZE_DAYS))

  return chunkStart
}

/**
 * Get the end of the chunk for a given date
 */
export function getChunkEnd(date) {
  const chunkStart = getChunkStart(date)
  const chunkEnd = new Date(chunkStart)
  chunkEnd.setUTCDate(chunkEnd.getUTCDate() + CHUNK_SIZE_DAYS - 1)
  chunkEnd.setUTCHours(23, 59, 59, 999)
  return chunkEnd
}

/**
 * Chunk a date range into 30-day segments aligned to fixed boundaries
 *
 * @param {Date} startDate - Start of the range
 * @param {Date} endDate - End of the range
 * @returns {Array<{from: Date, to: Date}>} Array of date range chunks
 */
export function chunkDateRange(startDate, endDate) {
  const chunks = []

  // Normalize dates to start of day for start, end of day for end (in UTC)
  const start = new Date(startDate)
  start.setUTCHours(0, 0, 0, 0)

  const end = new Date(endDate)
  end.setUTCHours(23, 59, 59, 999)

  console.log('[dateChunking] Input range:', start.toISOString(), 'to', end.toISOString())

  // Start from the beginning of the start date's chunk
  let currentStart = getChunkStart(start)

  // If the aligned chunk start is before our actual start, use the actual start
  if (currentStart < start) {
    currentStart = new Date(start)
  }

  // Safety counter to prevent infinite loops (max 100 chunks = ~8 years with 30-day chunks)
  let iterations = 0
  const MAX_ITERATIONS = 100

  while (currentStart.getTime() <= end.getTime() && iterations < MAX_ITERATIONS) {
    iterations++

    // Calculate the end of this chunk
    const chunkEnd = getChunkEnd(currentStart)

    // Use the earlier of chunk end or overall end date
    const actualChunkEnd = chunkEnd.getTime() > end.getTime() ? end : chunkEnd

    chunks.push({
      from: new Date(currentStart),
      to: new Date(actualChunkEnd)
    })

    console.log(`[dateChunking] Chunk ${iterations}: ${currentStart.toISOString().split('T')[0]} to ${actualChunkEnd.toISOString().split('T')[0]}`)

    // If this chunk reaches or exceeds the end date, we're done
    if (actualChunkEnd.getTime() >= end.getTime()) {
      console.log(`[dateChunking] Completed with ${iterations} chunks`)
      break
    }

    // Move to the start of the next day (day after chunk end)
    // Add 1 millisecond to get to midnight of next day, then normalize to UTC midnight
    currentStart = new Date(actualChunkEnd.getTime() + 1)
    currentStart.setUTCHours(0, 0, 0, 0)
  }

  if (iterations >= MAX_ITERATIONS) {
    console.error('[dateChunking] Exceeded maximum iterations')
    throw new Error('Date range chunking failed: too many iterations')
  }

  return chunks
}

/**
 * Get a date range for common time periods
 * IMPORTANT: Returns fixed chunk-aligned boundaries to ensure consistent cache keys
 *
 * @param {string} period - One of: '7days', '30days', '90days', '365days', 'all-time'
 * @returns {{from: Date, to: Date}} Date range
 */
export function getDateRangeForPeriod(period) {
  const now = new Date()

  // Get the end of the current chunk (today's chunk)
  const to = getChunkEnd(now)

  let from

  switch (period) {
    case '7days':
      // For 7 days, fetch the current chunk but we'll filter client-side
      // This ensures we use cached data from the 30-day chunk
      from = getChunkStart(now)
      break
    case '30days':
      // Go back 1 full chunk (30 days)
      from = getChunkStart(now)
      break
    case '90days':
      // Go back 3 full chunks (90 days)
      const ninetyDaysAgo = new Date(now)
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      from = getChunkStart(ninetyDaysAgo)
      break
    case '365days':
      // Go back 12 full chunks (~360 days)
      const oneYearAgo = new Date(now)
      oneYearAgo.setDate(oneYearAgo.getDate() - 365)
      from = getChunkStart(oneYearAgo)
      break
    case 'all-time':
      // Start from April 19, 2021 (inclusive)
      from = new Date('2021-04-19T00:00:00Z')
      break
    default:
      // Default to 7 days
      from = getChunkStart(now)
  }

  return { from, to }
}

/**
 * Format a date as ISO date string (YYYY-MM-DD)
 */
export function formatDateISO(date) {
  return date.toISOString().split('T')[0]
}
