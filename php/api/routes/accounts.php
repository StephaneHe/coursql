<?php
declare(strict_types=1);

$accounts = array_map(static fn(array $user): array => [
    'user_id' => $user['id'],
    'display_name' => $user['display_name'],
], Auth::accounts());
Http::send(200, ['accounts' => $accounts]);
