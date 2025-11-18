<?php

declare(strict_types=1);

namespace Molam\SDK\Http;

use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * HTTP Client Interface (PSR-18 compatible)
 *
 * Allows pluggable HTTP clients for testing and flexibility.
 */
interface HttpClientInterface
{
    /**
     * Send HTTP request and return response.
     *
     * @param RequestInterface $request PSR-7 request
     * @return ResponseInterface PSR-7 response
     * @throws \Molam\SDK\Exceptions\NetworkException On network errors
     * @throws \Molam\SDK\Exceptions\TimeoutException On timeout
     */
    public function send(RequestInterface $request): ResponseInterface;
}
