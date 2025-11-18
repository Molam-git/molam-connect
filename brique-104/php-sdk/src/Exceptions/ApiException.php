<?php

declare(strict_types=1);

namespace Molam\SDK\Exceptions;

use Exception;

/**
 * Base API Exception
 *
 * Thrown when API returns an error response.
 */
class ApiException extends Exception
{
    private int $statusCode;
    private string $errorCode;
    private array $errorDetails;
    private ?string $requestId;

    /**
     * @param string $message Error message
     * @param int $statusCode HTTP status code
     * @param string $errorCode Molam error code
     * @param array<string, mixed> $errorDetails Additional error details
     * @param string|null $requestId Request ID for debugging
     */
    public function __construct(
        string $message,
        int $statusCode = 0,
        string $errorCode = '',
        array $errorDetails = [],
        ?string $requestId = null
    ) {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->errorCode = $errorCode;
        $this->errorDetails = $errorDetails;
        $this->requestId = $requestId;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    public function getErrorDetails(): array
    {
        return $this->errorDetails;
    }

    public function getRequestId(): ?string
    {
        return $this->requestId;
    }

    /**
     * Get formatted error for logging.
     */
    public function toArray(): array
    {
        return [
            'message' => $this->getMessage(),
            'status_code' => $this->statusCode,
            'error_code' => $this->errorCode,
            'details' => $this->errorDetails,
            'request_id' => $this->requestId,
        ];
    }
}
