package com.momusic.android.ui.account

import android.content.Context
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// ====================================================================
//  登录彩蛋 —— 对齐 Windows 版 login-easter-egg
//  - 大小眼触发：依次点击 Logo 左眼 / 右眼各一次（顺序无所谓，各点一次即可）
//  - 四字愿望输入：答案是「世界和平」，拼音首字母 sjhp 也可解锁
//  - 解锁动画：缩放 + 颜色亮起
//  - 成就显示
//  - 用 SharedPreferences 记录解锁状态
// ====================================================================

/** 彩蛋答案：世界和平。对齐 loginEasterEggAnswer()。 */
private const val EASTER_EGG_ANSWER = "世界和平"

/** 拼音首字母简写同样视为正确。 */
private const val EASTER_EGG_PINYIN = "sjhp"

private const val PREFS_NAME = "momusic_easter_egg"
private const val KEY_UNLOCKED = "login_easter_egg_unlocked_v1"

/** 读取彩蛋解锁状态。 */
fun readEasterEggUnlocked(context: Context): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getBoolean(KEY_UNLOCKED, false)

/** 写入解锁状态。 */
private fun writeEasterEggUnlocked(context: Context, unlocked: Boolean) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit().putBoolean(KEY_UNLOCKED, unlocked).apply()
}

/** 彩蛋状态。 */
enum class EasterEggPhase {
    /** 初始隐藏。 */
    HIDDEN,
    /** 大小眼已触发，等待输入愿望。 */
    INPUT,
    /** 解锁动画进行中。 */
    UNLOCKING,
    /** 已解锁，显示成就。 */
    ACHIEVED,
}

@Composable
fun LoginEasterEgg(
    modifier: Modifier = Modifier,
    onDismiss: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // 初始状态：若已解锁则直接进入 ACHIEVED
    var phase by remember {
        mutableStateOf(
            if (readEasterEggUnlocked(context)) EasterEggPhase.ACHIEVED
            else EasterEggPhase.HIDDEN
        )
    }
    var leftEyeClicked by remember { mutableStateOf(false) }
    var rightEyeClicked by remember { mutableStateOf(false) }
    var wishInput by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val unlockScale = remember { Animatable(0.2f) }

    // 大小眼触发：左眼右眼各点一次后进入输入态
    LaunchedEffect(leftEyeClicked, rightEyeClicked) {
        if (leftEyeClicked && rightEyeClicked && phase == EasterEggPhase.HIDDEN) {
            phase = EasterEggPhase.INPUT
        }
    }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(18.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Logo 双眼（点击触发）
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                EyeBox(
                    label = "左眼",
                    isBig = true,
                    isActive = leftEyeClicked || phase != EasterEggPhase.HIDDEN,
                    onClick = { if (phase == EasterEggPhase.HIDDEN) leftEyeClicked = true },
                )
                Text(
                    text = "MOMusic",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
                EyeBox(
                    label = "右眼",
                    isBig = false,
                    isActive = rightEyeClicked || phase != EasterEggPhase.HIDDEN,
                    onClick = { if (phase == EasterEggPhase.HIDDEN) rightEyeClicked = true },
                )
            }

            when (phase) {
                EasterEggPhase.HIDDEN -> {
                    Text(
                        text = "悄悄提示：试着戳戳 Logo 的双眼…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                    )
                }
                EasterEggPhase.INPUT -> {
                    Text(
                        text = "我希望",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "输入一个四字愿望（或拼音首字母）",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                    OutlinedTextField(
                        value = wishInput,
                        onValueChange = {
                            // 仅保留前 4 个字符
                            wishInput = it.take(4)
                            errorMessage = null
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    // 四字格子预览
                    WishCells(value = wishInput)
                    Button(
                        onClick = {
                            val v = wishInput.trim()
                            if (v == EASTER_EGG_ANSWER || v.equals(EASTER_EGG_PINYIN, ignoreCase = true)) {
                                scope.launch {
                                    phase = EasterEggPhase.UNLOCKING
                                    unlockScale.animateTo(1f, tween(900))
                                    writeEasterEggUnlocked(context, true)
                                    phase = EasterEggPhase.ACHIEVED
                                }
                            } else {
                                errorMessage = "愿望似乎不对，再想想？"
                            }
                        },
                        enabled = wishInput.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("确认愿望") }
                }
                EasterEggPhase.UNLOCKING -> {
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .scale(unlockScale.value)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = EASTER_EGG_ANSWER,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Text(
                        text = "解锁中…",
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 12.sp,
                    )
                }
                EasterEggPhase.ACHIEVED -> {
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = "已达成成就",
                                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                                fontSize = 11.sp,
                            )
                            Text(
                                text = "$EASTER_EGG_ANSWER！",
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    OutlinedButton(
                        onClick = {
                            writeEasterEggUnlocked(context, false)
                            phase = EasterEggPhase.HIDDEN
                            leftEyeClicked = false
                            rightEyeClicked = false
                            wishInput = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("重置彩蛋") }
                }
            }

            errorMessage?.let { msg ->
                Text(
                    text = msg,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun EyeBox(
    label: String,
    isBig: Boolean,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    val size = if (isBig) 22.dp else 14.dp
    val color = if (isActive) MaterialTheme.colorScheme.primary
    else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(color)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .clickable(onClick = onClick),
        contentDescription = label,
    )
}

@Composable
private fun WishCells(value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (i in 0 until 4) {
            val ch = value.getOrNull(i)?.toString() ?: ""
            Surface(
                color = if (ch.isNotBlank()) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.size(36.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = ch,
                        color = if (ch.isNotBlank()) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}
