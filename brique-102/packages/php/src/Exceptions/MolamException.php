<?php

namespace Molam\Exceptions;

use GuzzleHttp\Exception\RequestException;

class MolamException extends \Exception
{
    /** @var string */
    private $code;

    /** @var int */
    private $status;

    /** @var string|null */
    private $requestId;

    /** @var array|null */
    private $details;

    public function __construct(
        string $code,
        string $message,
        int $status = 500,
        ?string $requestId = null,
        ?array $details = null
    ) {
        parent::__construct($message);
        $this->code = $code;
        $this->status = $status;
        $this->requestId = $requestId;
        $this->details = $details;
    }

    public function getErrorCode(): string
    {
        return $this->code;
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function getRequestId(): ?string
    {
        return $this->requestId;
    }

    public function getDetails(): ?array
    {
        return $this->details;
    }

    public static function fromGuzzleException(RequestException $e): self
    {
        $response = $e->getResponse();
        $status = $response ? $response->getStatusCode() : 500;

        $body = null;
        if ($response) {
            $body = json_decode((string)$response->getBody(), true);
        }

        $code = $body['error']['code'] ?? ($status >= 500 ? 'server_error' : 'request_failed');
        $message = $body['error']['message'] ?? $e->getMessage() ?? 'unknown_error';
        $requestId = $response ? $response->getHeader('X-Molam-Request-Id')[0] ?? null : null;

        return new self($code, $message, $status, $requestId, $body);
    }
}
