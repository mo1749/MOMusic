package com.momusic.android.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.momusic.android.ui.Screen

// ====================================================================
//  DesktopShell
//  桌面外壳容器，对齐 Windows 版 desktop-window-shell。
//  - 顶部自定义标题栏（透明，左侧 Logo，右侧 Home / 账号 / FX 浮动按钮）
//  - 底部播放控制条 BottomControlBar
//  - 右侧视觉控制台入口按钮 fx-fab
//  - 左侧歌单/队列面板入口
//  - 背景：FilamentCanvas 3D 画布（全屏，所有 UI 浮于其上）
//  - 内容区域 content 槽
// ====================================================================

/**
 * 桌面外壳。
 * @param navController 用于跳转 Home / Search / 账号 等页面
 * @param content 主内容槽
 */
@Composable
fun DesktopShell(
    navController: NavController,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var controlBarVisible by remember { mutableStateOf(true) }
    var showFxPanel by remember { mutableStateOf(false) }
    var showLeftPanel by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF08090B)),
    ) {
        // ---- 背景：FilamentCanvas 3D 画布（全屏） ----
        FilamentCanvas(
            modifier = Modifier.fillMaxSize(),
            onSurfaceCreated = { /* TODO: 挂载 ParticleSystem / Sonic / Lyrics3D 等子系统 */ },
        )

        // ---- 内容 + 顶栏 + 底栏 浮层 ----
        Column(modifier = Modifier.fillMaxSize()) {
            // 顶部自定义标题栏
            TopTitleBar(
                onHomeClick = {
                    navController.navigate(Screen.Home.route) {
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                onAccountClick = {
                    navController.navigate(Screen.User.route)
                },
                onFxClick = { showFxPanel = !showFxPanel },
                onLeftPanelClick = { showLeftPanel = !showLeftPanel },
            )

            // 主内容区
            Box(modifier = Modifier.weight(1f)) {
                content()

                // 左侧歌单/队列面板入口（悬浮按钮）
                LeftEntryFab(
                    onClick = { showLeftPanel = !showLeftPanel },
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .padding(start = 8.dp),
                )

                // 右侧视觉控制台入口（fx-fab）
                FxFab(
                    onClick = { showFxPanel = !showFxPanel },
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 8.dp),
                )

                // FX 浮层面板（占位，由 visual 子 agent 接入完整设置面板）
                AnimatedVisibility(
                    visible = showFxPanel,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.CenterEnd),
                ) {
                    FxPanelPlaceholder(onClose = { showFxPanel = false })
                }

                // 左侧面板（占位，由其他 subagent 接入队列/歌单面板）
                AnimatedVisibility(
                    visible = showLeftPanel,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.CenterStart),
                ) {
                    LeftPanelPlaceholder(onClose = { showLeftPanel = false })
                }
            }

            // 底部播放控制条
            AnimatedVisibility(
                visible = controlBarVisible,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                BottomControlBar(
                    navController = navController,
                    onHide = { controlBarVisible = false },
                    onImmersive = { /* TODO: 进入沉浸模式（隐藏系统栏 + 放大视觉） */ },
                    onDanmaku = { /* TODO: 切换弹幕显示 */ },
                    onLyricsToggle = { /* TODO: 切换歌词开关 */ },
                )
            }
        }

        // 控制条隐藏时，显示一个恢复按钮
        if (!controlBarVisible) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 8.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { controlBarVisible = true },
                shape = RoundedCornerShape(12.dp),
                color = Color(0xD40C0C10),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Default.GraphicEq,
                        contentDescription = "显示控制条",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "显示控制条",
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
    }
}

// ====================================================================
//  子组件
// ====================================================================

/** 顶部自定义标题栏：透明，左侧 Logo，右侧 Home / 账号 / FX。 */
@Composable
private fun TopTitleBar(
    onHomeClick: () -> Unit,
    onAccountClick: () -> Unit,
    onFxClick: () -> Unit,
    onLeftPanelClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.5f),
                    1f to Color.Transparent,
                )
            )
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // 左侧：Logo + 名称
        Row(verticalAlignment = Alignment.CenterVertically) {
            // 左侧面板入口按钮
            TitleBarButton(
                icon = Icons.Default.List,
                contentDescription = "歌单/队列",
                onClick = onLeftPanelClick,
            )
            Spacer(Modifier.width(8.dp))
            // Logo 圆点（青绿）
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = "MOMusic",
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
        // 右侧：Home / 账号 / FX
        Row(verticalAlignment = Alignment.CenterVertically) {
            TitleBarButton(
                icon = Icons.Default.Home,
                contentDescription = "首页",
                onClick = onHomeClick,
            )
            Spacer(Modifier.width(4.dp))
            TitleBarButton(
                icon = Icons.Default.AccountCircle,
                contentDescription = "账号",
                onClick = onAccountClick,
            )
            Spacer(Modifier.width(4.dp))
            TitleBarButton(
                icon = Icons.Default.Tune,
                contentDescription = "视觉控制台",
                onClick = onFxClick,
            )
        }
    }
}

/** 标题栏按钮 */
@Composable
private fun TitleBarButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** 左侧歌单/队列面板入口（悬浮） */
@Composable
private fun LeftEntryFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier
            .size(40.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        shape = CircleShape,
        color = Color(0xD40C0C10),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Default.List,
                contentDescription = "歌单/队列",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/** 右侧视觉控制台入口（fx-fab） */
@Composable
private fun FxFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Default.Tune,
                contentDescription = "视觉控制台",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

/** FX 浮层面板占位（TODO: 由 visual 子 agent 接入完整设置面板） */
@Composable
private fun FxPanelPlaceholder(onClose: () -> Unit) {
    GlassCard(
        modifier = Modifier
            .width(280.dp)
            .padding(end = 12.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "视觉控制台",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "收起",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.clickable(onClick = onClose),
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "TODO: 由 visual 子 agent 接入完整 FX 设置面板（粒子/声波/歌词3D/货架）",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

/** 左侧面板占位（TODO: 由其他 subagent 接入队列/歌单面板） */
@Composable
private fun LeftPanelPlaceholder(onClose: () -> Unit) {
    GlassCard(
        modifier = Modifier
            .width(280.dp)
            .padding(start = 12.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "播放队列 / 歌单",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "收起",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.clickable(onClick = onClose),
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "TODO: 由其他 subagent 接入队列/歌单面板",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
