<?php
declare(strict_types=1);

$user = Auth::requireUser();
Http::send(200, ['modules' => Progress::modules($user['id'])]);
