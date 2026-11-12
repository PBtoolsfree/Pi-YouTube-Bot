package com.pbhero.notificationbridge.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = PbCyan,
    secondary = PbPurple,
    background = PbBackground,
    surface = PbSurface,
    surfaceVariant = PbSurfaceVariant,
    onPrimary = PbBackground,
    onSecondary = PbBackground,
    onBackground = PbTextPrimary,
    onSurface = PbTextPrimary
)

@Composable
fun PBHeroTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}

