import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import {
  generateSyntheticDuplicateTradesStatement,
  generateSyntheticFiiCandidateMappingsStatement,
  generateSyntheticFiiMaterializationStatement,
} from './synthetic-capacity-statement.mjs'

const vite = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function splitStringAtEveryCharacter(text) {
  return Array.from({ length: text.length + 1 }, (_, offset) => [
    text.slice(0, offset),
    text.slice(offset),
  ])
}

function fixedStringChunks(text, size) {
  const chunks = []
  for (let offset = 0; offset < text.length; offset += size) {
    chunks.push(text.slice(offset, offset + size))
  }
  return chunks
}

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

function splitBytesAt(bytes, offset) {
  return [bytes.slice(0, offset), bytes.slice(offset)].filter(
    (chunk) => chunk.length > 0,
  )
}

class ControlledChunkBlob extends Blob {
  constructor(bytes, chunks) {
    super([bytes], { type: 'text/csv' })
    assert.equal(
      chunks.reduce((total, chunk) => total + chunk.length, 0),
      bytes.length,
      'The controlled Blob chunks did not cover every input byte exactly once.',
    )
    this.byteChunks = chunks.map((chunk) => chunk.slice())
    this.arrayBufferCalls = 0
    this.streamCalls = 0
    this.textCalls = 0
  }

  arrayBuffer() {
    this.arrayBufferCalls += 1
    throw new Error('visitBlobTextChunks must not call Blob.arrayBuffer().')
  }

  stream() {
    this.streamCalls += 1
    const chunks = this.byteChunks.map((chunk) => chunk.slice())
    let index = 0
    return new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close()
          return
        }
        controller.enqueue(chunks[index])
        index += 1
      },
    })
  }

  text() {
    this.textCalls += 1
    throw new Error('visitBlobTextChunks must not call Blob.text().')
  }
}

try {
  const {
    CsvParseFailure,
    CsvRowTokenizer,
    MAX_CSV_FIELDS_PER_ROW,
    parseCsvRows,
    visitBlobTextChunks,
  } = await vite.ssrLoadModule('/src/lib/csv.ts')
  const {
    Sha256Accumulator,
    Sha256TextAccumulator,
    sha256Hex,
  } = await vite.ssrLoadModule('/src/lib/sha256.ts')
  const {
    parseIbkrActivityStatement,
    parseIbkrActivityStatementBlob,
  } = await vite.ssrLoadModule('/src/lib/ibkr.ts')

  const encoder = new TextEncoder()

  const standardSha256Vectors = [
    {
      expected:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      text: '',
    },
    {
      expected:
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      text: 'abc',
    },
    {
      expected:
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      text: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    },
  ]
  const sha256Inputs = [
    ...standardSha256Vectors.map(({ text }) => text),
    '\0account\0salt',
    '中文与 emoji 😀🙂🌍',
    'a'.repeat(55),
    'b'.repeat(56),
    'c'.repeat(63),
    'd'.repeat(64),
    'e'.repeat(65),
    'isolated-high-\ud83d-end',
    'isolated-low-\ude00-end',
  ]

  for (const { expected, text } of standardSha256Vectors) {
    assert.equal(sha256Hex(text), expected, 'A standard SHA-256 vector failed.')
    assert.equal(
      new Sha256Accumulator().update(encoder.encode(text)).digestHex(),
      expected,
      'The byte accumulator failed a standard SHA-256 vector.',
    )
  }

  for (const text of sha256Inputs) {
    const bytes = encoder.encode(text)
    const expected = createHash('sha256').update(text, 'utf8').digest('hex')
    assert.equal(sha256Hex(text), expected)
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expected,
      'Node string and UTF-8 byte hashing disagreed.',
    )

    for (let offset = 0; offset <= bytes.length; offset += 1) {
      const accumulator = new Sha256Accumulator()
      accumulator.update(bytes.subarray(0, offset))
      accumulator.update(bytes.subarray(offset))
      assert.equal(
        accumulator.digestHex(),
        expected,
        `A byte SHA-256 split at ${offset} changed the digest.`,
      )
    }

    for (let offset = 0; offset <= text.length; offset += 1) {
      const accumulator = new Sha256TextAccumulator()
      accumulator.update(text.slice(0, offset))
      accumulator.update(text.slice(offset))
      assert.equal(
        accumulator.digestHex(),
        expected,
        `A UTF-16 SHA-256 split at ${offset} changed the digest.`,
      )
    }

    const oneCodeUnitAtATime = new Sha256TextAccumulator()
    for (let index = 0; index < text.length; index += 1) {
      oneCodeUnitAtATime.update(text.slice(index, index + 1))
    }
    assert.equal(oneCodeUnitAtATime.digestHex(), expected)
  }

  const surrogatePairFixture = 'before 😀 after'
  const surrogatePairSplit = surrogatePairFixture.indexOf('😀') + 1
  assert.equal(surrogatePairFixture.charCodeAt(surrogatePairSplit - 1), 0xd83d)
  assert.equal(surrogatePairFixture.charCodeAt(surrogatePairSplit), 0xde00)
  const surrogatePairAccumulator = new Sha256TextAccumulator()
  surrogatePairAccumulator.update(surrogatePairFixture.slice(0, surrogatePairSplit))
  surrogatePairAccumulator.update(surrogatePairFixture.slice(surrogatePairSplit))
  assert.equal(
    surrogatePairAccumulator.digestHex(),
    createHash('sha256').update(surrogatePairFixture, 'utf8').digest('hex'),
    'Splitting a surrogate pair changed the incremental text digest.',
  )

  const tokenizeChunks = (chunks, maxRows) => {
    const rows = []
    const rowNumbers = []
    const tokenizer = new CsvRowTokenizer((row, rowNumber) => {
      rows.push(row)
      rowNumbers.push(rowNumber)
    }, maxRows)
    for (const chunk of chunks) tokenizer.write(chunk)
    const rowCount = tokenizer.finish()
    assert.equal(rowCount, rows.length)
    assert.deepEqual(
      rowNumbers,
      rows.map((_, index) => index + 1),
      'The streaming tokenizer returned non-contiguous logical row numbers.',
    )
    return { rowCount, rows }
  }

  const assertCsvFailure = (operation, expectedCode, label) => {
    assert.throws(
      operation,
      (error) =>
        error instanceof CsvParseFailure && error.code === expectedCode,
      `${label} did not throw fixed ${expectedCode}.`,
    )
  }

  const tokenizerFixture = [
    '\uFEFFSection,Header,Name,Note',
    'Statement,Data,"\u4e2d\u6587 \ud83d\ude00","line one',
    'line two with ""quote"""',
    '',
    ',,,',
    'Final,Data,\u5c3e\u884c,\ud83d\ude42',
  ].join('\r\n')
  const expectedTokenizerRows = parseCsvRows(tokenizerFixture)
  assert.deepEqual(
    parseCsvRows('Section,Data," 740 "\n   \nNext,Data,ok\n'),
    [['Section', 'Data', ' 740 '], ['Next', 'Data', 'ok']],
    'Quoted field edges must stay intact while a whitespace-only row is skipped.',
  )

  for (const chunks of splitStringAtEveryCharacter(tokenizerFixture)) {
    assert.deepEqual(
      tokenizeChunks(chunks).rows,
      expectedTokenizerRows,
      'A UTF-16 chunk boundary changed the tokenizer result.',
    )
  }
  assert.deepEqual(
    tokenizeChunks(
      Array.from(
        { length: tokenizerFixture.length },
        (_, index) => tokenizerFixture.slice(index, index + 1),
      ),
    ).rows,
    expectedTokenizerRows,
    'One-code-unit chunks changed the tokenizer result.',
  )

  const unterminated = 'Statement,Data,"unterminated'
  for (const chunks of splitStringAtEveryCharacter(unterminated)) {
    assertCsvFailure(
      () => tokenizeChunks(chunks),
      'csv_unterminated_quote',
      'CsvRowTokenizer.finish()',
    )
  }

  for (const [label, malformed] of [
    ['quote inside an unquoted amount', 'Statement,Data,7"40.123456"\n'],
    ['text after a closing quote', 'Statement,Data,"740".123456\n'],
    ['reopened quoted field', 'Statement,Data,"7"4"0.123456"\n'],
    ['spaces after a closing quote', 'Statement,Data,"740"  \n'],
    ['bare carriage return inside an amount', 'Statement,Data,7\r40.123456\n'],
  ]) {
    assertCsvFailure(() => parseCsvRows(malformed), 'csv_malformed', label)
    for (const chunks of splitStringAtEveryCharacter(malformed)) {
      assertCsvFailure(
        () => tokenizeChunks(chunks),
        'csv_malformed',
        `${label} across a streaming split`,
      )
    }
    assertCsvFailure(
      () => tokenizeChunks(fixedStringChunks(malformed, 1)),
      'csv_malformed',
      `${label} one character at a time`,
    )
  }

  const validBytes = encoder.encode(tokenizerFixture)

  const visitControlledBlob = async (bytes, byteChunks) => {
    const blob = new ControlledChunkBlob(bytes, byteChunks)
    let decodedText = ''
    const decodedRows = []
    const decodedRowNumbers = []
    const tokenizer = new CsvRowTokenizer((row, rowNumber) => {
      decodedRows.push(row)
      decodedRowNumbers.push(rowNumber)
    })
    const characterCount = await visitBlobTextChunks(blob, (chunk) => {
      assert.equal(typeof chunk, 'string')
      decodedText += chunk
      tokenizer.write(chunk)
    })
    assert.equal(characterCount, decodedText.length)
    const rowCount = tokenizer.finish()
    assert.equal(rowCount, decodedRows.length)
    assert.deepEqual(
      decodedRowNumbers,
      decodedRows.map((_, index) => index + 1),
    )
    assert.equal(blob.textCalls, 0)
    assert.equal(blob.arrayBufferCalls, 0)
    assert.equal(blob.streamCalls, 1)
    return { decodedRows, decodedText }
  }

  const validBlobText = await new Blob([validBytes]).text()
  const validBlobRows = parseCsvRows(validBlobText)
  for (let offset = 0; offset <= validBytes.length; offset += 1) {
    const result = await visitControlledBlob(
      validBytes,
      splitBytesAt(validBytes, offset),
    )
    assert.equal(
      result.decodedText,
      validBlobText,
      `UTF-8 byte split ${offset} did not match Blob.text().`,
    )
    assert.deepEqual(
      result.decodedRows,
      validBlobRows,
      `UTF-8 byte split ${offset} changed parsed CSV rows.`,
    )
  }
  const oneByteResult = await visitControlledBlob(
    validBytes,
    [...validBytes].map((byte) => Uint8Array.of(byte)),
  )
  assert.equal(oneByteResult.decodedText, validBlobText)
  assert.deepEqual(oneByteResult.decodedRows, validBlobRows)

  const invalidUtf8Sequences = [
    Uint8Array.of(0x80),
    Uint8Array.of(0xc3, 0x28),
    Uint8Array.of(0xa0, 0xa1),
    Uint8Array.of(0xf0, 0x28, 0x8c, 0xbc),
  ]
  const invalidPrefix = encoder.encode('Invalid,Data,')
  const invalidSuffix = encoder.encode('\nTail,Data,done')
  const invalidUtf8Cases = invalidUtf8Sequences.map((sequence) =>
    concatBytes(invalidPrefix, sequence, invalidSuffix),
  )
  invalidUtf8Cases.push(
    concatBytes(invalidPrefix, Uint8Array.of(0xe2, 0x82)),
  )

  for (const bytes of invalidUtf8Cases) {
    const expectedText = await new Blob([bytes]).text()
    const expectedRows = parseCsvRows(expectedText)
    assert.match(expectedText, /\uFFFD/)
    for (let offset = 0; offset <= bytes.length; offset += 1) {
      const result = await visitControlledBlob(bytes, splitBytesAt(bytes, offset))
      assert.equal(
        result.decodedText,
        expectedText,
        `Invalid UTF-8 byte split ${offset} did not match Blob.text().`,
      )
      assert.deepEqual(result.decodedRows, expectedRows)
    }
    const result = await visitControlledBlob(
      bytes,
      [...bytes].map((byte) => Uint8Array.of(byte)),
    )
    assert.equal(result.decodedText, expectedText)
    assert.deepEqual(result.decodedRows, expectedRows)
  }

  for (const quoted of [false, true]) {
    const exactValue = 'x'.repeat(250_000)
    const exactField = quoted ? `"${exactValue}"` : exactValue
    const exactChunks = quoted
      ? [exactField.slice(0, 250_000), exactField.slice(250_000, 250_001), '"']
      : [exactField.slice(0, 249_999), exactField.slice(249_999)]
    const exactResult = tokenizeChunks(exactChunks)
    assert.equal(exactResult.rowCount, 1)
    assert.equal(exactResult.rows[0][0].length, 250_000)
    assert.deepEqual(exactResult.rows, parseCsvRows(exactField))

    const overValue = 'x'.repeat(250_001)
    const overField = quoted ? `"${overValue}"` : overValue
    assertCsvFailure(
      () => tokenizeChunks(fixedStringChunks(overField, 4_093)),
      'csv_field_too_large',
      `${quoted ? 'Quoted' : 'Unquoted'} 250,001-character field`,
    )
  }

  const exactColumns = Array.from(
    { length: MAX_CSV_FIELDS_PER_ROW },
    (_, index) => `F${index}`,
  ).join(',')
  const lastExactComma = exactColumns.lastIndexOf(',')
  const exactColumnResult = tokenizeChunks([
    exactColumns.slice(0, lastExactComma),
    ',',
    exactColumns.slice(lastExactComma + 1),
  ])
  assert.equal(exactColumnResult.rows[0].length, 4_096)
  assert.deepEqual(exactColumnResult.rows, parseCsvRows(exactColumns))

  const overColumns = `${exactColumns},overflow`
  assertCsvFailure(
    () => tokenizeChunks([exactColumns, ',', 'overflow']),
    'csv_too_many_fields',
    '4,097-column streamed row',
  )
  assertCsvFailure(
    () => parseCsvRows(overColumns),
    'csv_too_many_fields',
    '4,097-column materialized row',
  )

  const exactRowsText = `${'row\r\n'.repeat(99_999)}row`
  let visitedRows = 0
  const exactRowTokenizer = new CsvRowTokenizer((row, rowNumber) => {
    visitedRows += 1
    assert.equal(rowNumber, visitedRows)
    assert.deepEqual(row, ['row'])
  }, 100_000)
  for (const chunk of fixedStringChunks(exactRowsText, 4_093)) {
    exactRowTokenizer.write(chunk)
  }
  assert.equal(exactRowTokenizer.finish(), 100_000)
  assert.equal(visitedRows, 100_000)

  const overRowsText = `${exactRowsText}\r\nrow`
  let visitedBeforeRowOverflow = 0
  assertCsvFailure(
    () => {
      const tokenizer = new CsvRowTokenizer(() => {
        visitedBeforeRowOverflow += 1
      }, 100_000)
      for (const chunk of fixedStringChunks(overRowsText, 4_093)) {
        tokenizer.write(chunk)
      }
      tokenizer.finish()
    },
    'csv_too_many_rows',
    '100,001-row streamed CSV',
  )
  assert.equal(visitedBeforeRowOverflow, 100_000)

  const standardFixture = readFileSync(
    new URL('../tests/fixtures/ibkr-current-schema-synthetic.csv', import.meta.url),
    'utf8',
  )
  assert.ok(!standardFixture.startsWith('\uFEFF'))
  assert.ok(standardFixture.includes('\n'))
  assert.ok(!standardFixture.includes('\r'))

  const mutationNeedle = 'Synthetic Regression Fixture'
  const mutationOffset = standardFixture.indexOf(mutationNeedle)
  assert.ok(mutationOffset >= 0)
  assert.equal(mutationOffset, standardFixture.lastIndexOf(mutationNeedle))
  const mutatedCharacterOffset = mutationOffset + mutationNeedle.length - 1
  const oneCharacterMutation =
    standardFixture.slice(0, mutatedCharacterOffset) +
    'X' +
    standardFixture.slice(mutatedCharacterOffset + 1)
  assert.equal(oneCharacterMutation.length, standardFixture.length)
  assert.equal(
    Array.from(
      { length: standardFixture.length },
      (_, index) => standardFixture[index] !== oneCharacterMutation[index],
    ).filter(Boolean).length,
    1,
  )

  const parseOptions = {
    accountComparisonSalt: 'csv-streaming-equivalence-salt',
    currentDate: new Date('2026-08-30T12:00:00.000Z'),
  }
  const parserEquivalenceCases = [
    {
      expectedSource: 'synthetic',
      label: 'canonical synthetic LF fixture',
      text: standardFixture,
    },
    {
      expectedSource: 'synthetic',
      label: 'synthetic CRLF fixture',
      text: standardFixture.replace(/\n/g, '\r\n'),
    },
    {
      expectedSource: 'synthetic',
      label: 'synthetic BOM fixture',
      text: `\uFEFF${standardFixture}`,
    },
    {
      expectedSource: 'local',
      label: 'one-character local mutation',
      text: oneCharacterMutation,
    },
  ]

  for (const { expectedSource, label, text } of parserEquivalenceCases) {
    const synchronousResult = parseIbkrActivityStatement(text, parseOptions)
    const blobResult = await parseIbkrActivityStatementBlob(
      new Blob([text], { type: 'text/csv' }),
      parseOptions,
    )
    assert.deepEqual(
      blobResult,
      synchronousResult,
      `${label} produced different complete ParseResult values.`,
    )
    assert.deepEqual(synchronousResult.errors, [], `${label} did not parse.`)
    assert.ok(synchronousResult.report, `${label} did not produce a report.`)
    assert.equal(
      synchronousResult.report.source,
      expectedSource,
      `${label} received the wrong source classification.`,
    )
  }

  // Keep the high-cardinality parser workloads while leaving the exact
  // 5 MiB/100,000-row combined endpoint to the dedicated browser evidence.
  const pressureTargetBytes = 3 * 1_024 * 1_024
  const pressureTargetRows = 20_020
  const pressureParserEquivalenceCases = [
    {
      generate: () =>
        generateSyntheticFiiMaterializationStatement({
          noiseOrder: 'before',
          targetBytes: pressureTargetBytes,
          targetRows: pressureTargetRows,
        }),
      label: 'FII unused rows before the consumed mapping',
      verify: (statement) => {
        assert.equal(statement.noiseOrder, 'before')
        assert.equal(statement.unusedOptionRows, 20_000)
        assert.equal(statement.byteLength, pressureTargetBytes)
        assert.equal(statement.rowCount, pressureTargetRows)
      },
    },
    {
      generate: () =>
        generateSyntheticFiiMaterializationStatement({
          noiseOrder: 'after',
          targetBytes: pressureTargetBytes,
          targetRows: pressureTargetRows,
        }),
      label: 'FII unused rows after the consumed mapping',
      verify: (statement) => {
        assert.equal(statement.noiseOrder, 'after')
        assert.equal(statement.unusedOptionRows, 20_000)
        assert.equal(statement.byteLength, pressureTargetBytes)
        assert.equal(statement.rowCount, pressureTargetRows)
      },
    },
    {
      generate: () =>
        generateSyntheticFiiCandidateMappingsStatement({
          targetBytes: pressureTargetBytes,
          targetRows: pressureTargetRows,
        }),
      label: '10,000 FII candidate mappings',
      verify: (statement) => {
        assert.equal(statement.candidateOptionRows, 10_000)
        assert.equal(statement.byteLength, pressureTargetBytes)
        assert.equal(statement.rowCount, pressureTargetRows)
      },
    },
    {
      generate: () => generateSyntheticDuplicateTradesStatement(),
      label: '25,001 duplicate trades',
      verify: (statement) => {
        assert.equal(statement.duplicateTradeRows, 25_001)
      },
    },
  ]

  for (const { generate, label, verify } of pressureParserEquivalenceCases) {
    const statement = generate()
    verify(statement)
    const synchronousResult = parseIbkrActivityStatement(
      statement.text,
      parseOptions,
    )
    const blobResult = await parseIbkrActivityStatementBlob(
      new Blob([statement.text], { type: 'text/csv' }),
      parseOptions,
    )
    assert.deepEqual(
      blobResult,
      synchronousResult,
      `${label} produced different complete ParseResult values.`,
    )
    assert.deepEqual(synchronousResult.errors, [], `${label} did not parse.`)
    assert.ok(synchronousResult.report, `${label} did not produce a report.`)
  }

  console.log('CSV, incremental SHA, and Blob parser streaming checks passed.')
  console.log({
    exhaustiveUtf16Boundaries: tokenizerFixture.length + 1,
    exhaustiveUtf8Boundaries: validBytes.length + 1,
    invalidUtf8Cases: invalidUtf8Cases.length,
    maxColumnsAccepted: 4_096,
    maxFieldCharactersAccepted: 250_000,
    maxRowsAccepted: 100_000,
    parserEquivalenceCases: parserEquivalenceCases.length,
    pressureParserEquivalenceCases: pressureParserEquivalenceCases.length,
    sha256Inputs: sha256Inputs.length,
  })
} finally {
  await vite.close()
}
