<?php
declare(strict_types=1);

$user = Auth::current();
Http::send(200, ['user' => $user === null ? null : [
    'user_id' => $user['id'],
    'display_name' => $user['display_name'],
]]);
