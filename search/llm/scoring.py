"""评分计算模块 - 计算影响程度评分（1-10分）和整体级别（1-4级）。"""

from typing import Any, Dict, Optional


def extract_number(value: Any) -> Optional[int]:
    """从字符串或数字中提取整数。
    
    示例：
        "15 roads" -> 15
        "15" -> 15
        15 -> 15
        None -> None
    """
    if value is None:
        return None
    
    if isinstance(value, int):
        return value
    
    if isinstance(value, str):
        # 尝试提取数字（处理 "15 roads" 格式）
        import re
        match = re.search(r'(\d+)', value)
        if match:
            try:
                return int(match.group(1))
            except (ValueError, TypeError):
                pass
    
    return None


def parse_loss_amount(loss_str: str) -> float:
    """解析经济损失金额（转换为million单位）。
    
    示例：
        "50 million EUR" -> 50.0
        "1.5 billion EUR" -> 1500.0
        "500 thousand EUR" -> 0.5
    """
    if not loss_str or not isinstance(loss_str, str):
        return 0.0
    
    import re
    # 匹配数字和单位
    match = re.search(r'([\d.]+)\s*(million|billion|thousand)?', loss_str, re.IGNORECASE)
    if not match:
        return 0.0
    
    try:
        amount = float(match.group(1))
        unit = (match.group(2) or '').lower()
        
        # 转换为million单位
        if unit == 'billion':
            amount *= 1000
        elif unit == 'thousand':
            amount /= 1000
        
        return amount
    except (ValueError, TypeError):
        return 0.0


def calculate_transport_impact_level(transport_impact: Optional[Dict[str, Any]]) -> Optional[int]:
    """计算交通影响程度（1-10分）。
    
    策略：
    1. 如果有明确数字，使用数字计算
    2. 如果没有数字，使用severity_inference
    3. 如果都没有，使用description中的关键词
    
    Args:
        transport_impact: 交通影响数据，包含 quantitative_data
        
    Returns:
        1-10分的评分，如果无法计算则返回None
    """
    if not transport_impact or not transport_impact.get("quantitative_data"):
        return None
    
    data = transport_impact["quantitative_data"]
    
    # 策略1：如果有明确数字，使用数字计算
    closed_roads = extract_number(data.get("closed_roads"))
    bridges_damaged = extract_number(data.get("bridges_damaged"))
    
    if closed_roads is not None or bridges_damaged is not None:
        score = 0
        
        # 道路关闭评分
        if closed_roads is not None:
            if closed_roads >= 30:
                score += 9
            elif closed_roads >= 15:
                score += 7
            elif closed_roads >= 5:
                score += 5
            elif closed_roads >= 1:
                score += 2
            else:
                score += 1  # 即使没有道路关闭，也可能有轻微影响
        
        # 桥梁受损加分
        if bridges_damaged is not None:
            if bridges_damaged >= 3:
                score += 2
            elif bridges_damaged >= 1:
                score += 1
        
        return min(10, max(1, score))
    
    # 策略2：如果没有数字，使用severity_inference
    severity = data.get("severity_inference", "").lower() if isinstance(data.get("severity_inference"), str) else ""
    if severity == "extreme":
        return 9
    elif severity == "high":
        return 7
    elif severity == "moderate":
        return 5
    elif severity == "low":
        return 2
    elif severity == "very_low":
        return 1
    
    # 策略3：如果都没有，使用description中的关键词
    description = (data.get("description", "") or "").lower()
    if any(word in description for word in ["severe", "extensive", "major", "massive"]):
        return 7
    elif any(word in description for word in ["some", "several", "moderate"]):
        return 5
    elif any(word in description for word in ["minor", "limited", "few"]):
        return 2
    
    # 默认值
    return 1


def calculate_economy_impact_level(economy_impact: Optional[Dict[str, Any]]) -> Optional[int]:
    """计算经济影响程度（1-10分）。
    
    策略：
    1. 如果有明确数字，使用数字计算
    2. 如果没有数字，使用severity_inference
    3. 如果都没有，使用description中的关键词
    
    Args:
        economy_impact: 经济影响数据，包含 quantitative_data
        
    Returns:
        1-10分的评分，如果无法计算则返回None
    """
    if not economy_impact or not economy_impact.get("quantitative_data"):
        return None
    
    data = economy_impact["quantitative_data"]
    
    # 策略1：如果有明确数字，使用数字计算
    estimated_loss = data.get("estimated_loss")
    if estimated_loss:
        loss = parse_loss_amount(str(estimated_loss))
        if loss > 0:
            if loss >= 50:
                return 9
            elif loss >= 10:
                return 7
            elif loss >= 1:
                return 5
            elif loss >= 0.1:
                return 2
            else:
                return 1
    
    # 策略2：如果没有数字，使用severity_inference
    severity = data.get("severity_inference", "").lower() if isinstance(data.get("severity_inference"), str) else ""
    if severity == "extreme":
        return 9
    elif severity == "high":
        return 7
    elif severity == "moderate":
        return 5
    elif severity == "low":
        return 2
    elif severity == "very_low":
        return 1
    
    # 策略3：如果都没有，使用description中的关键词
    description = (data.get("description", "") or "").lower()
    if any(word in description for word in ["millions", "billions", "significant", "major"]):
        return 7
    elif any(word in description for word in ["thousands", "moderate", "some"]):
        return 5
    elif any(word in description for word in ["minor", "limited", "minimal"]):
        return 2
    
    # 默认值
    return 1


def calculate_safety_impact_level(safety_impact: Optional[Dict[str, Any]]) -> Optional[int]:
    """计算安全影响程度（1-10分）。
    
    策略：
    1. 如果有明确数字，使用数字计算
    2. 如果没有数字，使用severity_inference
    3. 如果都没有，使用description中的关键词
    
    Args:
        safety_impact: 安全影响数据，包含 quantitative_data
        
    Returns:
        1-10分的评分，如果无法计算则返回None
    """
    if not safety_impact or not safety_impact.get("quantitative_data"):
        return None
    
    data = safety_impact["quantitative_data"]
    
    # 策略1：如果有明确数字，使用数字计算
    injured = extract_number(data.get("injured"))
    deaths = extract_number(data.get("deaths"))
    evacuated = extract_number(data.get("evacuated"))
    houses_damaged = extract_number(data.get("houses_damaged"))
    
    if injured is not None or deaths is not None or evacuated is not None or houses_damaged is not None:
        score = 0
        
        # 伤亡评分
        casualties = (injured or 0) + (deaths or 0)
        if casualties >= 20:
            score += 9
        elif casualties >= 5:
            score += 7
        elif casualties >= 1:
            score += 4
        else:
            score += 1  # 无伤亡
        
        # 疏散人数加分
        if evacuated is not None:
            if evacuated >= 1000:
                score += 2
            elif evacuated >= 200:
                score += 1
        
        # 房屋受损加分
        if houses_damaged is not None:
            if houses_damaged >= 200:
                score += 2
            elif houses_damaged >= 50:
                score += 1
        
        return min(10, max(1, score))
    
    # 策略2：如果没有数字，使用severity_inference
    severity = data.get("severity_inference", "").lower() if isinstance(data.get("severity_inference"), str) else ""
    if severity == "extreme":
        return 9
    elif severity == "high":
        return 7
    elif severity == "moderate":
        return 5
    elif severity == "low":
        return 2
    elif severity == "very_low":
        return 1
    
    # 策略3：如果都没有，使用description中的关键词
    description = (data.get("description", "") or "").lower()
    if any(word in description for word in ["massive", "extensive", "hundreds of"]):
        return 7
    elif any(word in description for word in ["many", "dozens", "hundreds"]):
        return 5
    elif any(word in description for word in ["several", "a few", "some"]):
        return 2
    elif any(word in description for word in ["no casualties", "no injuries", "no deaths"]):
        return 1
    
    # 默认值
    return 1


def calculate_overall_level(
    transport_level: Optional[int],
    economy_level: Optional[int],
    safety_level: Optional[int],
) -> Optional[int]:
    """计算整体级别（1-4级）。
    
    基于三个影响程度的平均值计算：
    - 1级：平均 < 3（轻微影响）
    - 2级：平均 3-5（中等影响）
    - 3级：平均 6-8（严重影响）
    - 4级：平均 > 8（极端影响）
    
    Args:
        transport_level: 交通影响程度（1-10分）
        economy_level: 经济影响程度（1-10分）
        safety_level: 安全影响程度（1-10分）
        
    Returns:
        1-4级的整体级别，如果无法计算则返回None
    """
    # 只计算非空值
    levels = [l for l in [transport_level, economy_level, safety_level] if l is not None]
    
    if not levels:
        return None
    
    avg = sum(levels) / len(levels)
    
    if avg < 3:
        return 1  # 1级：轻微影响
    elif avg < 6:
        return 2  # 2级：中等影响
    elif avg < 9:
        return 3  # 3级：严重影响
    else:
        return 4  # 4级：极端影响

