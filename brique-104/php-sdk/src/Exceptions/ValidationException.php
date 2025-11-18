<?php

declare(strict_types=1);

namespace Molam\SDK\Exceptions;

use Exception;

/**
 * Validation Exception
 *
 * Thrown when input validation fails.
 */
class ValidationException extends Exception
{
    private array $errors;

    /**
     * @param string $message Error message
     * @param array<string, mixed> $errors Validation errors by field
     */
    public function __construct(string $message, array $errors = [])
    {
        parent::__construct($message);
        $this->errors = $errors;
    }

    public function getErrors(): array
    {
        return $this->errors;
    }
}
