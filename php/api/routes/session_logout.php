<?php
declare(strict_types=1);

Auth::logout();
Http::send(204, []);
