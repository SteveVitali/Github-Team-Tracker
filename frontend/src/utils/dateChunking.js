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
 *
 * @param {string} period - One of: '30days', '90days', '365days', 'all-time'
 * @returns {{from: Date, to: Date}} Date range
 */
export function getDateRangeForPeriod(period) {
  const now = new Date()
  now.setHours(23, 59, 59, 999)

  let from

  switch (period) {
    case '30days':
      from = new Date(now)
      from.setDate(from.getDate() - 30)
      break
    case '90days':
      from = new Date(now)
      from.setDate(from.getDate() - 90)
      break
    case '365days':
      from = new Date(now)
      from.setDate(from.getDate() - 365)
      break
    case 'all-time':
      // Start from Jan 1, 2020 (adjust as needed)
      from = new Date('2020-01-01T00:00:00Z')
      break
    default:
      from = new Date(now)
      from.setDate(from.getDate() - 30)
  }

  from.setHours(0, 0, 0, 0)

  return { from, to: now }
}

/**
 * Format a date as ISO date string (YYYY-MM-DD)
 */
export function formatDateISO(date) {
  return date.toISOString().split('T')[0]
}
