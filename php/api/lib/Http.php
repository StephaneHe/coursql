<?php
declare(strict_types=1);

final class Http
{
    public static function send(int $status, array $body): never
    {
        http_response_code($status);
        if ($status !== 204) {
            echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
        exit;
    }

    public static function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }
        if (strlen($raw) > 65536) {
            self::send(413, ['error' => 'payload_too_large', 'messageFr' => 'Requête trop volumineuse.']);
        }
        try {
            $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            self::send(400, ['error' => 'invalid_json', 'messageFr' => 'Corps JSON invalide.']);
        }
        if (!is_array($body)) {
            self::send(400, ['error' => 'invalid_json', 'messageFr' => 'Corps JSON invalide.']);
        }
        return $body;
    }
}
