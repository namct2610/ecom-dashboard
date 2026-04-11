<?php

declare(strict_types=1);

namespace Dashboard\Parsers;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use RuntimeException;

abstract class BaseParser
{
    protected string $filePath;

    public function __construct(string $filePath)
    {
        $this->filePath = $filePath;
    }

    abstract public function parse(int $uploadId): array;

    protected function sheet(int $index = 0): Worksheet
    {
        if (!class_exists(IOFactory::class)) {
            throw new RuntimeException('PhpSpreadsheet not installed.');
        }
        $reader = IOFactory::createReaderForFile($this->filePath);
        $reader->setReadDataOnly(true);
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }
        $spreadsheet = $reader->load($this->filePath);
        return $spreadsheet->getSheet($index);
    }

    protected function cell(array $row, ?int $colIdx): ?string
    {
        if ($colIdx === null) return null;
        $value = $row[$colIdx] ?? null;
        if ($value === null) return null;
        $str = is_string($value) ? trim($value) : (string) $value;
        return $str === '' ? null : $str;
    }

    protected function isEmptyRow(array $row): bool
    {
        foreach ($row as $v) {
            if ($v !== null && $v !== '') return false;
        }
        return true;
    }

    /**
     * Match column names from Excel headers to field names using fuzzy matching.
     * Each entry in $columnMap: 'field' => ['candidate1', 'candidate2', ...]
     * Returns: 'field' => column_index (0-based), or null if not found.
     */
    protected function resolveColumns(array $headers, array $columnMap): array
    {
        $resolved = [];
        $lower = [];
        foreach ($headers as $i => $h) {
            $lower[$i] = $this->normalizeHeader((string)($h ?? ''));
        }

        foreach ($columnMap as $field => $candidates) {
            $match = null;
            // Exact match first
            foreach ($candidates as $term) {
                $termN = $this->normalizeHeader($term);
                if ($termN === '') continue;
                foreach ($lower as $i => $hN) {
                    if ($hN === $termN) { $match = $i; break 2; }
                }
            }
            // Substring match
            if ($match === null) {
                foreach ($candidates as $term) {
                    $termN = $this->normalizeHeader($term);
                    if ($termN === '') continue;
                    foreach ($lower as $i => $hN) {
                        if ($hN !== '' && str_contains($hN, $termN)) { $match = $i; break 2; }
                    }
                }
            }
            $resolved[$field] = $match;
        }
        return $resolved;
    }

    private function normalizeHeader(string $s): string
    {
        $s = mb_strtolower(trim($s));
        if (class_exists('\Normalizer')) {
            $n = \Normalizer::normalize($s, \Normalizer::FORM_C);
            if ($n !== false) return $n;
        }
        return $s;
    }
}
